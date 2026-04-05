"""
simplifier.py — Narrationifier class
Translates technical browser-use agent output into warm, plain English narration
that a grandparent would understand. Powered by Gemini gemini-2.5-flash.
"""

import os
import re
from google import genai
from google.genai import types
from dotenv import load_dotenv

load_dotenv()

# Patterns for cheap local classification (avoid LLM call for speed)
_CONFIRM_PATTERNS = re.compile(
    r"(submit|click.*submit|post.*form|place.*order|buy|purchase|checkout|"
    r"send.*message|send.*email|delete|remove|unsubscribe|cancel.*subscription|"
    r"change.*password|update.*payment|add.*cart|pay|confirm.*order|"
    r"schedule.*appointment|book.*appointment|refill.*prescription|"
    r"fill.*form.*submit|press.*submit)",
    re.IGNORECASE,
)

_STOP_PATTERNS = re.compile(
    r"(enter.*password.*unknown|type.*credit.*card|payment.*info.*unrecognized|"
    r"ssn|social.*security|bank.*account.*number)",
    re.IGNORECASE,
)

_SYSTEM_PERSONA = (
    "You are the voice of Navigator, a friendly web assistant helping elderly people "
    "and people who struggle with technology. You speak in warm, simple, reassuring language — "
    "like a helpful neighbor, not a computer. Keep responses to 1-2 short sentences. "
    "Never use technical jargon. Use first person ('I'm...'). Be calm and positive."
)


class Narrationifier:
    """Translates technical agent actions into warm plain-English narration."""

    def __init__(self):
        api_key = os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")
        if not api_key:
            raise ValueError("GEMINI_API_KEY environment variable is not set.")
        # Set GOOGLE_API_KEY too so langchain picks it up
        os.environ["GOOGLE_API_KEY"] = api_key
        self._client = genai.Client(api_key=api_key)
        self._model = "gemini-2.5-flash"

    def _ask(self, prompt: str) -> str:
        """Send a prompt to Gemini and return the text response."""
        response = self._client.models.generate_content(
            model=self._model,
            contents=f"{_SYSTEM_PERSONA}\n\n{prompt}",
            config=types.GenerateContentConfig(
                temperature=0.3,
                max_output_tokens=500,
            ),
        )
        return response.text.strip()

    def simplify_action(self, technical_action: str) -> str:
        """
        Convert a technical browser action into plain English.
        e.g. "clicking element #btn-submit at coordinates 450,230"
             -> "I'm clicking the Submit button for you"
        """
        prompt = (
            f"A browser assistant is performing this technical action:\n"
            f'"{technical_action}"\n\n'
            f"Translate this into one short, friendly sentence a grandparent would understand. "
            f"Start with 'I'm' or 'I just' or 'Now I'm'. "
            f"Do NOT mention coordinates, element IDs, CSS selectors, or any technical terms."
        )
        try:
            return self._ask(prompt)
        except Exception:
            return "I'm working on the next step for you..."

    def simplify_result(self, technical_result: str) -> str:
        """
        Convert raw agent output into a plain English summary.
        """
        truncated = technical_result[:3000] if len(technical_result) > 3000 else technical_result
        prompt = (
            f"A browser assistant just completed a task. Here is the raw output:\n"
            f'"{truncated}"\n\n'
            f"Write a 1-2 sentence friendly summary of what was accomplished or found, "
            f"in simple language a grandparent would understand. "
            f"Focus on what matters to the person, not technical details."
        )
        try:
            return self._ask(prompt)
        except Exception:
            return "I've finished that step. Let me know what you'd like to do next."

    def generate_confirmation_request(self, action: str, context: str) -> str:
        """
        Generate a friendly confirmation question for a risky action.
        """
        prompt = (
            f"A browser assistant is about to do something that cannot be undone:\n"
            f"Action: {action}\n"
            f"Context: {context}\n\n"
            f"Write a warm, clear confirmation question the user must answer yes or no to. "
            f"Be specific about what will happen (include any names, amounts, items if visible in the context). "
            f"End with 'Shall I go ahead?' or 'Is that okay?' or 'Would you like me to continue?'. "
            f"Keep it to 1-2 sentences. No technical jargon."
        )
        try:
            return self._ask(prompt)
        except Exception:
            return f"I'm about to {action}. Shall I go ahead?"

    def classify_action_risk(self, action: str) -> str:
        """
        Classify the risk of an action.
        Returns: "safe" | "confirm_needed" | "stop"
        """
        action_lower = action.lower()

        if _STOP_PATTERNS.search(action_lower):
            return "stop"

        if _CONFIRM_PATTERNS.search(action_lower):
            return "confirm_needed"

        prompt = (
            f"A web automation assistant is about to perform this action:\n"
            f'"{action}"\n\n'
            f"Classify the risk level as exactly one of these words:\n"
            f"- safe (just browsing, clicking links, reading, searching)\n"
            f"- confirm_needed (submitting a form, making a purchase, sending a message, booking something, changing account settings)\n"
            f"- stop (entering passwords on unknown sites, providing payment info on unrecognized domains)\n\n"
            f"Respond with ONLY one word: safe, confirm_needed, or stop."
        )
        try:
            result = self._ask(prompt).strip().lower()
            if result in ("safe", "confirm_needed", "stop"):
                return result
        except Exception:
            pass

        return "safe"

    def clean_voice_transcript(self, raw_transcript: str) -> str:
        """
        Clean up imperfect speech-to-text transcript into a clear instruction.
        """
        prompt = (
            f"A speech-to-text system recorded this from a user:\n"
            f'"{raw_transcript}"\n\n'
            f"Clean this up into a clear, complete instruction for a web assistant. "
            f"Fix any obvious speech-to-text errors. Remove filler words like 'um', 'uh', 'like'. "
            f"Keep the user's intent. Return just the cleaned instruction, nothing else."
        )
        try:
            return self._ask(prompt)
        except Exception:
            return raw_transcript

    def friendly_error(self, technical_error: str) -> str:
        """Convert a technical error into a friendly message."""
        prompt = (
            f"A web assistant encountered this error:\n"
            f'"{technical_error}"\n\n'
            f"Write a short, friendly apology message (1 sentence) that tells the user something "
            f"went wrong without using any technical terms. Suggest they try again. "
            f"Be warm and reassuring."
        )
        try:
            return self._ask(prompt)
        except Exception:
            return "I'm sorry, something went wrong. Please tap the button and try again."


# ─── Standalone test ───────────────────────────────────────────────────────────
if __name__ == "__main__":
    print("Testing Narrationifier...\n")
    n = Narrationifier()

    tests = [
        ("simplify_action", "clicking element #btn-submit-prescription at coordinates 450,230"),
        ("simplify_action", "navigating to https://www.cvs.com/pharmacy/rx-history"),
        ("simplify_action", "typing 'John Smith' into input[name='patient_name']"),
        ("simplify_result", "HTTP 200 OK. Form submitted. Response: {'status': 'success', 'refill_id': 'RX-8821', 'medication': 'Lisinopril 10mg', 'pickup_date': '2026-04-06'}"),
        ("generate_confirmation_request", "submit prescription refill form", "Medication: Lisinopril 10mg, Quantity: 30 tablets, Pharmacy: CVS on Main St"),
        ("classify_action_risk", "clicking the Search button"),
        ("classify_action_risk", "submitting the checkout form with credit card"),
        ("classify_action_risk", "entering password into login form on unknown-site.biz"),
        ("clean_voice_transcript", "um I want to uh refill my the prescription for my heart medicine"),
        ("friendly_error", "ConnectionRefusedError: [Errno 111] Connection refused at port 9222"),
    ]

    for method, *args in tests:
        fn = getattr(n, method)
        result = fn(*args)
        print(f"[{method}]")
        print(f"  IN:  {args[0][:80]}")
        print(f"  OUT: {result}")
        print()