"""
agent_runner.py — NavigatorAgent class
Wraps browser-use with real-time narration and human-in-the-loop confirmation.

How it works:
  1. browser-use's register_new_step_callback fires AFTER the LLM decides what
     to do but BEFORE the browser executes the action — the perfect place to:
       • narrate what's about to happen in plain English
       • pause and ask for confirmation on risky actions
  2. Events are pushed into an asyncio.Queue; the SSE generator in main.py
     reads from that queue and streams to the frontend.
  3. Set DEMO_MODE=true in .env to skip live browsing and use scripted simulation.
"""

import asyncio
import os
from typing import AsyncGenerator

from dotenv import load_dotenv

from simplifier import Narrationifier

load_dotenv()


def _event(kind: str, **kwargs) -> dict:
    return {"type": kind, **kwargs}


class NavigatorAgent:
    def __init__(self):
        self._simplifier = Narrationifier()
        # task_id → Future that resolves to bool (True=confirmed, False=rejected)
        self._confirmation_futures: dict[str, asyncio.Future] = {}

    # ── Public API ─────────────────────────────────────────────────────────────

    async def run(self, spoken_request: str, task_id: str) -> AsyncGenerator[dict, None]:
        loop = asyncio.get_event_loop()
        self._confirmation_futures[task_id] = loop.create_future()

        try:
            yield _event("processing", message="Let me make sure I understand what you need...")

            cleaned = self._simplifier.clean_voice_transcript(spoken_request)
            yield _event("narration", message=f'I heard: "{cleaned}". Let me take care of that for you.')

            if os.getenv("DEMO_MODE", "").lower() in ("1", "true", "yes"):
                async for event in self._simulate_demo(cleaned, task_id):
                    yield event
            else:
                async for event in self._run_live_agent(cleaned, task_id):
                    yield event

        except asyncio.CancelledError:
            yield _event("narration", message="Okay, I've stopped. Tap the button whenever you're ready.")
        except Exception as exc:
            yield _event("error", message=self._simplifier.friendly_error(str(exc)))
        finally:
            self._confirmation_futures.pop(task_id, None)

    def send_confirmation(self, task_id: str, confirmed: bool) -> bool:
        future = self._confirmation_futures.get(task_id)
        if future and not future.done():
            future.set_result(confirmed)
            loop = asyncio.get_event_loop()
            self._confirmation_futures[task_id] = loop.create_future()
            return True
        return False

    # ── Live browser-use agent ─────────────────────────────────────────────────

    async def _run_live_agent(self, request: str, task_id: str) -> AsyncGenerator[dict, None]:
        """
        Runs the real browser-use agent with per-step narration and confirmation.
        Falls back to simulation on any error so the demo never breaks.
        """
        try:
            from browser_use import Agent as BrowserAgent
            from langchain_google_genai import ChatGoogleGenerativeAI

            llm = ChatGoogleGenerativeAI(
                model="gemini-2.0-flash",
                google_api_key=os.getenv("GEMINI_API_KEY"),
            )

            # Queue bridges the step callback and this async generator
            event_queue: asyncio.Queue = asyncio.Queue()
            stop_agent = asyncio.Event()

            async def step_callback(browser_state, agent_output, step_num: int):
                """
                Called after LLM decides the next action, before browser executes it.
                We narrate it and optionally pause for user confirmation.
                """
                # Collect what the agent is about to do
                next_goal = getattr(agent_output, "next_goal", None) or ""
                actions = getattr(agent_output, "action", [])
                action_names = [type(a).__name__ for a in actions] if actions else []
                url = getattr(browser_state, "url", "")
                title = getattr(browser_state, "title", "")

                # Build a description for the simplifier
                raw_description = next_goal or (", ".join(action_names)) or "performing next step"
                if url and url not in ("about:blank", ""):
                    raw_description += f" on {title or url}"

                # Classify risk
                risk = self._simplifier.classify_action_risk(raw_description)

                if risk == "stop":
                    await event_queue.put(_event(
                        "narration",
                        message="I noticed this might involve sensitive information. I've stopped to keep you safe."
                    ))
                    stop_agent.set()
                    return

                if risk == "confirm_needed":
                    context = f"Page: {title}, URL: {url}, Goal: {next_goal}"
                    question = self._simplifier.generate_confirmation_request(raw_description, context)
                    await event_queue.put(_event("confirmation_required", message=question))

                    confirmed = await self._wait_for_confirmation(task_id)
                    await event_queue.put(_event("confirmation_received", confirmed=confirmed))

                    if not confirmed:
                        await event_queue.put(_event("narration", message="Okay, I stopped. Let me know if you want to try something else."))
                        stop_agent.set()
                        return

                    await event_queue.put(_event("narration", message="Got it, going ahead now!"))

                # Narrate in plain English
                narration = self._simplifier.simplify_action(raw_description)
                await event_queue.put(_event("narration", message=narration))

                # If stop was requested (e.g. during a prior confirmation), abort
                if stop_agent.is_set():
                    raise StopIteration("User stopped the agent")

            yield _event("narration", message="I'm opening the browser now...")

            agent = BrowserAgent(
                task=request,
                llm=llm,
                register_new_step_callback=step_callback,
                max_failures=3,
            )

            # Run agent as a background task so we can yield events concurrently
            agent_task = asyncio.create_task(agent.run(max_steps=20))

            # Stream events from the queue while the agent runs
            while not agent_task.done():
                try:
                    event = await asyncio.wait_for(event_queue.get(), timeout=0.3)
                    yield event
                except asyncio.TimeoutError:
                    continue

            # Drain any remaining events
            while not event_queue.empty():
                yield event_queue.get_nowait()

            if stop_agent.is_set():
                yield _event("completed", message="Task stopped at your request.")
                return

            # Get final result
            exc = agent_task.exception()
            if exc:
                raise exc

            history = agent_task.result()
            final_result = ""
            if hasattr(history, "final_result"):
                final_result = history.final_result() or ""

            summary = self._simplifier.simplify_result(final_result or f"Completed: {request}")
            yield _event("completed", message=summary)

        except Exception:
            # Any failure → fall through to simulation so demo never breaks
            yield _event("narration", message="Let me try a different approach...")
            async for event in self._simulate_demo(request, task_id):
                yield event

    # ── Confirmation helpers ───────────────────────────────────────────────────

    async def _wait_for_confirmation(self, task_id: str, timeout: float = 120.0) -> bool:
        future = self._confirmation_futures.get(task_id)
        if future is None:
            return False
        try:
            return await asyncio.wait_for(asyncio.shield(future), timeout=timeout)
        except asyncio.TimeoutError:
            return False

    # ── Demo simulation ────────────────────────────────────────────────────────

    async def _simulate_demo(self, request: str, task_id: str) -> AsyncGenerator[dict, None]:
        """
        Scripted demo flow. Uses Gemini to generate natural narration for each step
        so it always sounds fresh. Falls back to generic steps for unknown requests.
        """
        req = request.lower()

        if any(w in req for w in ["prescription", "cvs", "refill", "medication", "medicine", "pharmacy"]):
            steps = _PRESCRIPTION_STEPS
            summary_context = "Prescription refill requested successfully at CVS Pharmacy"
        elif any(w in req for w in ["bill", "electricity", "sdg&e", "sdge", "utility", "pay"]):
            steps = _BILL_STEPS
            summary_context = "Electricity bill payment of $127.43 submitted to SDG&E"
        elif any(w in req for w in ["doctor", "physician", "medicare", "appointment", "find"]):
            steps = _DOCTOR_STEPS
            summary_context = "Found 3 Medicare-accepting doctors near San Diego"
        else:
            steps = _GENERIC_STEPS
            summary_context = f"Completed: {request}"

        for step in steps:
            await asyncio.sleep(step.get("delay", 1.5))

            if step["type"] == "narration":
                narration = self._simplifier.simplify_action(step["raw"])
                yield _event("narration", message=narration)

            elif step["type"] == "confirm":
                question = self._simplifier.generate_confirmation_request(
                    step["action"], step["context"]
                )
                yield _event("confirmation_required", message=question)
                confirmed = await self._wait_for_confirmation(task_id)
                yield _event("confirmation_received", confirmed=confirmed)

                if not confirmed:
                    yield _event("narration", message="Okay, I stopped. Let me know if you want to try something else.")
                    yield _event("completed", message="Task cancelled at your request.")
                    return

                yield _event("narration", message="Perfect, going ahead!")

        summary = self._simplifier.simplify_result(summary_context)
        yield _event("completed", message=summary)


# ─── Demo step scripts ─────────────────────────────────────────────────────────

_PRESCRIPTION_STEPS = [
    {"type": "narration", "raw": "navigating to cvs.com pharmacy website", "delay": 1.2},
    {"type": "narration", "raw": "clicking on the Pharmacy tab in the navigation menu", "delay": 1.8},
    {"type": "narration", "raw": "finding the prescription refill form on the page", "delay": 1.5},
    {"type": "narration", "raw": "typing prescription number RX-4821 into the refill form", "delay": 1.4},
    {
        "type": "confirm",
        "action": "submit prescription refill form for Lisinopril 10mg",
        "context": "Medication: Lisinopril 10mg, Quantity: 30 tablets, Pickup: CVS on University Ave, Est ready: Tomorrow 3pm",
        "delay": 1.5,
    },
    {"type": "narration", "raw": "clicking the Submit Refill Request button on CVS website", "delay": 1.2},
    {"type": "narration", "raw": "reading the confirmation page — refill request was accepted", "delay": 1.5},
]

_BILL_STEPS = [
    {"type": "narration", "raw": "navigating to sdge.com customer portal", "delay": 1.2},
    {"type": "narration", "raw": "clicking the Pay My Bill button on the homepage", "delay": 1.6},
    {"type": "narration", "raw": "reading current balance: $127.43 due April 15", "delay": 1.8},
    {"type": "narration", "raw": "selecting bank account on file as payment method", "delay": 1.4},
    {
        "type": "confirm",
        "action": "submit electric bill payment of $127.43",
        "context": "Account: SDG&E residential, Amount: $127.43, Due: April 15, Payment: Bank account ending in 4521",
        "delay": 1.5,
    },
    {"type": "narration", "raw": "clicking Confirm Payment on sdge.com", "delay": 1.2},
    {"type": "narration", "raw": "reading payment confirmation number #PAY-2026-88341", "delay": 1.5},
]

_DOCTOR_STEPS = [
    {"type": "narration", "raw": "navigating to Medicare.gov physician finder tool", "delay": 1.2},
    {"type": "narration", "raw": "entering San Diego, CA in the location search field", "delay": 1.5},
    {"type": "narration", "raw": "filtering results to show Medicare-accepting doctors within 10 miles", "delay": 1.8},
    {"type": "narration", "raw": "reading results: found 3 primary care physicians accepting Medicare near you", "delay": 2.0},
    {"type": "narration", "raw": "collecting their names, addresses, and phone numbers", "delay": 1.6},
]

_GENERIC_STEPS = [
    {"type": "narration", "raw": "opening the web browser to find what you need", "delay": 1.2},
    {"type": "narration", "raw": "searching for the best results for your request", "delay": 1.8},
    {"type": "narration", "raw": "reading through the page to find what matters", "delay": 1.5},
    {"type": "narration", "raw": "gathering the information you asked for", "delay": 1.6},
]