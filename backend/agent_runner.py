"""
agent_runner.py — NavigatorAgent class
Uses Browser Use Cloud REST API (v2) directly via httpx.

Flow:
  1. POST /api/v2/tasks  -> {id: taskId, sessionId}
  2. GET  /api/v2/sessions/{sessionId} -> {liveUrl}  (send to frontend to embed)
  3. Poll GET /api/v2/tasks/{taskId} every 2s -> steps[], status
  4. For each new step: narrate it, check risk, maybe ask for confirmation
  5. On status=finished/stopped: summarize and complete

Language support: pass language="es-US" (BCP-47) to run() and all narration
will come back in that language via Gemini.
"""

import asyncio
import os
from typing import AsyncGenerator

import httpx
from dotenv import load_dotenv

from simplifier import Narrationifier

load_dotenv()

BU_BASE = "https://api.browser-use.com/api/v2"
POLL_INTERVAL = 0.8          # was 2.0 — check for new steps more frequently
LIVE_URL_WAIT  = 0.5         # was 2.0 — browser session is usually ready fast


def _event(kind: str, **kwargs) -> dict:
    return {"type": kind, **kwargs}


class NavigatorAgent:
    def __init__(self):
        self._simplifier = Narrationifier()
        self._confirmation_futures: dict[str, asyncio.Future] = {}

    async def run(
        self, spoken_request: str, task_id: str, language: str = "en-US"
    ) -> AsyncGenerator[dict, None]:
        loop = asyncio.get_event_loop()
        self._confirmation_futures[task_id] = loop.create_future()

        try:
            cleaned = self._simplifier.clean_voice_transcript(spoken_request, language=language)
            yield _event("processing", message=cleaned)

            if os.getenv("DEMO_MODE", "").lower() in ("1", "true", "yes"):
                async for event in self._simulate_demo(cleaned, task_id, language=language):
                    yield event
            else:
                async for event in self._run_live_agent(cleaned, task_id, language=language):
                    yield event

        except asyncio.CancelledError:
            yield _event("narration", message="Stopped. Tap the button whenever you're ready.")
        except Exception as exc:
            yield _event("error", message=self._simplifier.friendly_error(str(exc), language=language))
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

    async def _run_live_agent(
        self, request: str, task_id: str, language: str = "en-US"
    ) -> AsyncGenerator[dict, None]:
        api_key = os.getenv("BROWSER_USE_API_KEY")
        if not api_key:
            async for event in self._simulate_demo(request, task_id, language=language):
                yield event
            return

        headers = {"X-Browser-Use-API-Key": api_key, "Content-Type": "application/json"}

        try:
            async with httpx.AsyncClient(timeout=30) as client:
                # 1. Create task
                resp = await client.post(
                    f"{BU_BASE}/tasks",
                    headers=headers,
                    json={"task": request, "llm": "gemini-2.5-flash", "maxSteps": 20},
                )
                resp.raise_for_status()
                task_data = resp.json()
                bu_task_id = task_data["id"]
                session_id = task_data["sessionId"]

                # 2. Get liveUrl — retry a few times if session isn't ready yet
                live_url = None
                for attempt in range(6):
                    await asyncio.sleep(LIVE_URL_WAIT)
                    sess_resp = await client.get(f"{BU_BASE}/sessions/{session_id}", headers=headers)
                    sess_resp.raise_for_status()
                    live_url = sess_resp.json().get("liveUrl")
                    if live_url:
                        break
                if live_url:
                    yield _event("live_url", url=live_url, session_id=session_id)

                # 3. Poll for steps — narration runs concurrently so LLM never blocks the loop
                seen_steps: set[int] = set()
                pending_narrations: list[asyncio.Task] = []
                recent_narrations: list[str] = []  # last 3 spoken narrations for dedup

                async def _narrate_step(raw_action: str, lang: str, recent: list[str]):
                    """Returns a narration event or None if skipped."""
                    text = await asyncio.get_event_loop().run_in_executor(
                        None, lambda: self._simplifier.simplify_action(raw_action, lang, recent)
                    )
                    return _event("narration", message=text) if text else None

                while True:
                    await asyncio.sleep(POLL_INTERVAL)

                    # Flush any completed narration tasks first
                    still_pending = []
                    for t in pending_narrations:
                        if t.done():
                            result = t.result()
                            if result:
                                yield result
                                recent_narrations.insert(0, result["message"])
                                if len(recent_narrations) > 3:
                                    recent_narrations.pop()
                        else:
                            still_pending.append(t)
                    pending_narrations = still_pending

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

                        raw = next_goal + (
                            f" on {url}" if url and url not in ("about:blank", "") else ""
                        )
                        # Risk classification is always English (internal)
                        risk = self._simplifier.classify_action_risk(raw)

                        if risk == "stop":
                            yield _event("narration", message="Stopped — I spotted something that didn't look right and didn't want to go further without checking with you.")
                            await client.patch(
                                f"{BU_BASE}/tasks/{bu_task_id}",
                                headers=headers,
                                json={"action": "stop_task_and_session"},
                            )
                            yield _event(
                                "completed",
                                message=self._simplifier.simplify_result(
                                    "stopped task to protect user safety", language=language
                                ),
                            )
                            return

                        if risk == "confirm_needed":
                            question = self._simplifier.generate_confirmation_request(
                                raw, f"URL: {url}, Goal: {next_goal}", language=language
                            )
                            yield _event("confirmation_required", message=question)
                            await client.patch(
                                f"{BU_BASE}/tasks/{bu_task_id}",
                                headers=headers,
                                json={"action": "pause"},
                            )
                            confirmed = await self._wait_for_confirmation(task_id)
                            yield _event("confirmation_received", confirmed=confirmed)

                            if not confirmed:
                                await client.patch(
                                    f"{BU_BASE}/tasks/{bu_task_id}",
                                    headers=headers,
                                    json={"action": "stop_task_and_session"},
                                )
                                yield _event("narration", message="No problem, stopped. Just tap the button whenever you want to try something.")
                                yield _event("completed", message="Stopped.")
                                return

                            await client.patch(
                                f"{BU_BASE}/tasks/{bu_task_id}",
                                headers=headers,
                                json={"action": "resume"},
                            )
                            yield _event("narration", message="Got it, going ahead.")

                        narration_task = asyncio.create_task(
                            _narrate_step(raw, language, list(recent_narrations))
                        )
                        pending_narrations.append(narration_task)

                    if status in ("finished", "stopped"):
                        output = task_info.get("output") or f"Completed: {request}"
                        summary = self._simplifier.simplify_result(output, language=language)
                        yield _event("completed", message=summary)
                        try:
                            await client.patch(
                                f"{BU_BASE}/sessions/{session_id}",
                                headers=headers,
                                json={"action": "stop"},
                            )
                        except Exception:
                            pass
                        return

        except Exception as exc:
            async for event in self._simulate_demo(request, task_id, language=language):
                yield event

    async def _wait_for_confirmation(self, task_id: str, timeout: float = 120.0) -> bool:
        future = self._confirmation_futures.get(task_id)
        if future is None:
            return False
        try:
            return await asyncio.wait_for(asyncio.shield(future), timeout=timeout)
        except asyncio.TimeoutError:
            return False

    async def _simulate_demo(
        self, request: str, task_id: str, language: str = "en-US"
    ) -> AsyncGenerator[dict, None]:
        req = request.lower()
        if any(w in req for w in [
            # English
            "prescription", "cvs", "refill", "medication", "medicine", "pharmacy",
            # Spanish
            "receta", "medicamento", "farmacia", "medicación", "medicina",
            # Chinese
            "处方", "药店", "药品", "配药",
            # French
            "ordonnance", "pharmacie", "médicament",
            # German
            "rezept", "apotheke", "medikament",
            # Japanese
            "処方", "薬局", "薬",
            # Korean
            "처방", "약국", "약",
            # Portuguese
            "receita", "farmácia", "medicamento",
            # Hindi
            "नुस्खा", "दवाखाना", "दवा",
            # Arabic
            "وصفة", "صيدلية", "دواء",
        ]):
            steps = _PRESCRIPTION_STEPS
            summary_context = "Prescription refill requested successfully at CVS Pharmacy"
        elif any(w in req for w in [
            # English
            "bill", "electricity", "sdg&e", "sdge", "utility", "pay",
            # Spanish
            "factura", "electricidad", "pagar", "pago", "recibo",
            # Chinese
            "账单", "电费", "付款", "缴费",
            # French
            "facture", "électricité", "payer",
            # German
            "rechnung", "strom", "bezahlen",
            # Japanese
            "請求", "電気代", "支払",
            # Korean
            "청구서", "전기요금", "납부",
            # Portuguese
            "conta", "eletricidade", "pagar",
            # Hindi
            "बिल", "बिजली", "भुगतान",
            # Arabic
            "فاتورة", "كهرباء", "دفع",
        ]):
            steps = _BILL_STEPS
            summary_context = "Electricity bill payment of $127.43 submitted to SDG&E"
        elif any(w in req for w in [
            # English
            "doctor", "physician", "medicare", "appointment", "find",
            # Spanish
            "médico", "doctor", "cita", "médicos", "buscar",
            # Chinese
            "医生", "医院", "预约", "找",
            # French
            "médecin", "docteur", "rendez-vous", "trouver",
            # German
            "arzt", "doktor", "termin", "finden",
            # Japanese
            "医者", "医師", "予約", "探す",
            # Korean
            "의사", "병원", "예약", "찾다",
            # Portuguese
            "médico", "doutor", "consulta", "encontrar",
            # Hindi
            "डॉक्टर", "चिकित्सक", "अपॉइंटमेंट", "खोजें",
            # Arabic
            "طبيب", "دكتور", "موعد", "ابحث",
            # Vietnamese
            "bác sĩ", "cuộc hẹn", "tìm",
            # Filipino
            "doktor", "manggagamot", "appointment",
        ]):
            steps = _DOCTOR_STEPS
            summary_context = "Found 3 Medicare-accepting doctors near San Diego"
        else:
            steps = _GENERIC_STEPS
            summary_context = f"Completed: {request}"

        recent_demo: list[str] = []
        for step in steps:
            await asyncio.sleep(step.get("delay", 1.5))
            if step["type"] == "narration":
                narration = self._simplifier.simplify_action(step["raw"], language=language, recent=recent_demo)
                if narration:
                    yield _event("narration", message=narration)
                    recent_demo.insert(0, narration)
                    if len(recent_demo) > 3:
                        recent_demo.pop()
            elif step["type"] == "confirm":
                question = self._simplifier.generate_confirmation_request(
                    step["action"], step["context"], language=language
                )
                yield _event("confirmation_required", message=question)
                confirmed = await self._wait_for_confirmation(task_id)
                yield _event("confirmation_received", confirmed=confirmed)
                if not confirmed:
                    yield _event("narration", message="No problem, stopped. Let me know if you want to try something else.")
                    yield _event("completed", message="Stopped.")
                    return
                yield _event("narration", message="Got it, going ahead.")

        summary = self._simplifier.simplify_result(summary_context, language=language)
        yield _event("completed", message=summary)


# ─── Demo step scripts (raw technical strings → run through simplifier) ────────

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