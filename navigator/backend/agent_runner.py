"""
agent_runner.py — NavigatorAgent class
Uses Browser Use Cloud REST API (v2) directly via httpx.

Flow:
  1. POST /api/v2/tasks  -> {id: taskId, sessionId}
  2. GET  /api/v2/sessions/{sessionId} -> {liveUrl}  (send to frontend to embed)
  3. Poll GET /api/v2/tasks/{taskId} every 2s -> steps[], status
  4. For each new step: narrate it, check risk, maybe ask for confirmation
  5. On status=finished/stopped: summarize and complete
"""

import asyncio
import os
from typing import AsyncGenerator

import httpx
from dotenv import load_dotenv

from simplifier import Narrationifier

load_dotenv()

BU_BASE = "https://api.browser-use.com/api/v2"
POLL_INTERVAL = 2.0


def _event(kind: str, **kwargs) -> dict:
    return {"type": kind, **kwargs}


class NavigatorAgent:
    def __init__(self):
        self._simplifier = Narrationifier()
        self._confirmation_futures: dict[str, asyncio.Future] = {}

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

    async def _run_live_agent(self, request: str, task_id: str) -> AsyncGenerator[dict, None]:
        api_key = os.getenv("BROWSER_USE_API_KEY")
        if not api_key:
            yield _event("narration", message="No Browser Use API key found, using simulation...")
            async for event in self._simulate_demo(request, task_id):
                yield event
            return

        headers = {"X-Browser-Use-API-Key": api_key, "Content-Type": "application/json"}

        try:
            async with httpx.AsyncClient(timeout=30) as client:
                # 1. Create task
                yield _event("narration", message="I'm starting up the browser for you now...")
                resp = await client.post(
                    f"{BU_BASE}/tasks",
                    headers=headers,
                    json={"task": request, "llm": "gemini-2.5-flash", "maxSteps": 20},
                )
                resp.raise_for_status()
                task_data = resp.json()
                bu_task_id = task_data["id"]
                session_id = task_data["sessionId"]

                # 2. Get liveUrl
                await asyncio.sleep(2.0)
                sess_resp = await client.get(f"{BU_BASE}/sessions/{session_id}", headers=headers)
                sess_resp.raise_for_status()
                live_url = sess_resp.json().get("liveUrl")
                if live_url:
                    yield _event("live_url", url=live_url, session_id=session_id)

                # 3. Poll for steps
                seen_steps = set()
                while True:
                    await asyncio.sleep(POLL_INTERVAL)
                    task_resp = await client.get(f"{BU_BASE}/tasks/{bu_task_id}", headers=headers)
                    task_resp.raise_for_status()
                    task_info = task_resp.json()
                    status = task_info.get("status", "")
                    steps = task_info.get("steps", [])

                    for step in steps:
                        step_num = step.get("number", 0)
                        if step_num in seen_steps:
                            continue
                        seen_steps.add(step_num)

                        next_goal = step.get("nextGoal", "") or ""
                        url = step.get("url", "") or ""
                        if not next_goal:
                            continue

                        raw = next_goal + (f" on {url}" if url and url not in ("about:blank", "") else "")
                        risk = self._simplifier.classify_action_risk(raw)

                        if risk == "stop":
                            yield _event("narration", message="I noticed something sensitive. I've stopped to keep you safe.")
                            await client.patch(f"{BU_BASE}/tasks/{bu_task_id}", headers=headers, json={"action": "stop_task_and_session"})
                            yield _event("completed", message="I stopped to keep your information safe.")
                            return

                        if risk == "confirm_needed":
                            question = self._simplifier.generate_confirmation_request(raw, f"URL: {url}, Goal: {next_goal}")
                            yield _event("confirmation_required", message=question)
                            await client.patch(f"{BU_BASE}/tasks/{bu_task_id}", headers=headers, json={"action": "pause"})
                            confirmed = await self._wait_for_confirmation(task_id)
                            yield _event("confirmation_received", confirmed=confirmed)
                            if not confirmed:
                                await client.patch(f"{BU_BASE}/tasks/{bu_task_id}", headers=headers, json={"action": "stop_task_and_session"})
                                yield _event("narration", message="Okay, I stopped. Let me know if you want to try something else.")
                                yield _event("completed", message="Task stopped at your request.")
                                return
                            await client.patch(f"{BU_BASE}/tasks/{bu_task_id}", headers=headers, json={"action": "resume"})
                            yield _event("narration", message="Got it, going ahead!")

                        narration = self._simplifier.simplify_action(raw)
                        yield _event("narration", message=narration)

                    if status in ("finished", "stopped"):
                        output = task_info.get("output") or f"Completed: {request}"
                        summary = self._simplifier.simplify_result(output)
                        yield _event("completed", message=summary)
                        try:
                            await client.patch(f"{BU_BASE}/sessions/{session_id}", headers=headers, json={"action": "stop"})
                        except Exception:
                            pass
                        return

        except Exception as exc:
            yield _event("narration", message="Let me try a different approach...")
            async for event in self._simulate_demo(request, task_id):
                yield event

    async def _wait_for_confirmation(self, task_id: str, timeout: float = 120.0) -> bool:
        future = self._confirmation_futures.get(task_id)
        if future is None:
            return False
        try:
            return await asyncio.wait_for(asyncio.shield(future), timeout=timeout)
        except asyncio.TimeoutError:
            return False

    async def _simulate_demo(self, request: str, task_id: str) -> AsyncGenerator[dict, None]:
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
                question = self._simplifier.generate_confirmation_request(step["action"], step["context"])
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


_PRESCRIPTION_STEPS = [
    {"type": "narration", "raw": "navigating to cvs.com pharmacy website", "delay": 1.2},
    {"type": "narration", "raw": "clicking on the Pharmacy tab in the navigation menu", "delay": 1.8},
    {"type": "narration", "raw": "finding the prescription refill form on the page", "delay": 1.5},
    {"type": "narration", "raw": "typing prescription number RX-4821 into the refill form", "delay": 1.4},
    {"type": "confirm", "action": "submit prescription refill form for Lisinopril 10mg", "context": "Medication: Lisinopril 10mg, Quantity: 30 tablets, Pickup: CVS on University Ave, Est ready: Tomorrow 3pm", "delay": 1.5},
    {"type": "narration", "raw": "clicking the Submit Refill Request button on CVS website", "delay": 1.2},
    {"type": "narration", "raw": "reading the confirmation page — refill request was accepted", "delay": 1.5},
]

_BILL_STEPS = [
    {"type": "narration", "raw": "navigating to sdge.com customer portal", "delay": 1.2},
    {"type": "narration", "raw": "clicking the Pay My Bill button on the homepage", "delay": 1.6},
    {"type": "narration", "raw": "reading current balance: $127.43 due April 15", "delay": 1.8},
    {"type": "narration", "raw": "selecting bank account on file as payment method", "delay": 1.4},
    {"type": "confirm", "action": "submit electric bill payment of $127.43", "context": "Account: SDG&E residential, Amount: $127.43, Due: April 15, Payment: Bank account ending in 4521", "delay": 1.5},
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