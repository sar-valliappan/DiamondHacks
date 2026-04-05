"""
simplifier.py — Narrationifier class
Translates technical browser-use agent output into warm, plain-language narration
that a grandparent would understand. Powered by Gemini gemini-2.5-flash.

Now multilingual: every public method accepts an optional `language` parameter
(BCP-47 tag, e.g. "es-US", "zh-CN"). When provided, Gemini responds in that
language so all narration/confirmation text matches what the user speaks.
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

_BASE_PERSONA = (
    "You are the voice of Navigator, a friendly web assistant helping elderly people "
    "and people who struggle with technology. You speak in warm, simple, reassuring language — "
    "like a helpful neighbor, not a computer. Keep responses to 1-2 short sentences. "
    "Never use technical jargon. Use first person ('I'm...'). Be calm and positive."
)

# Human-readable language names for the prompt, keyed by BCP-47 base tag
_LANG_NAMES = {
    "en": "English",
    "es": "Spanish",
    "zh": "Chinese (Simplified)",
    "fr": "French",
    "de": "German",
    "ja": "Japanese",
    "ko": "Korean",
    "pt": "Portuguese",
    "ar": "Arabic",
    "hi": "Hindi",
    "vi": "Vietnamese",
    "tl": "Filipino (Tagalog)",
}


def _build_system_persona(language: str = "en-US") -> str:
    base = language.split("-")[0].lower()
    lang_name = _LANG_NAMES.get(base, "English")
    if base == "en":
        return _BASE_PERSONA
    return (
        _BASE_PERSONA
        + f" IMPORTANT: You MUST respond entirely in {lang_name}. "
        f"Do not use any English in your response."
    )


class Narrationifier:
    """Translates technical agent actions into warm plain-language narration."""

    def __init__(self):
        api_key = os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")
        if not api_key:
            raise ValueError("GEMINI_API_KEY environment variable is not set.")
        os.environ["GOOGLE_API_KEY"] = api_key
        self._client = genai.Client(api_key=api_key)
        self._model = "gemini-2.5-flash"

    def _ask(self, prompt: str, language: str = "en-US") -> str:
        """Send a prompt to Gemini and return the text response."""
        system_persona = _build_system_persona(language)
        response = self._client.models.generate_content(
            model=self._model,
            contents=f"{system_persona}\n\n{prompt}",
            config=types.GenerateContentConfig(
                temperature=0.3,
                max_output_tokens=500,
            ),
        )
        return response.text.strip()

    def simplify_action(self, technical_action: str, language: str = "en-US") -> str:
        """
        Convert a technical browser action into a natural human update.
        Only narrates things the user actually cares about — skips trivial steps.
        Returns empty string "" if the action is too minor to mention.
        """
        prompt = (
            "A browser assistant just did this:\n"
            f'"{technical_action}"\n\n'
            "Return exactly SKIP if it is: opening/loading a page, basic navigation, "
            "a generic setup step, or very similar to something just said.\n\n"
            "Otherwise write ONE short casual sentence. Hard rules:\n"
            "NEVER start with I'm or I am — completely banned.\n"
            "Use varied openers: Found..., Got..., Looks like..., Filling in..., "
            "Spotted..., Selecting..., Almost there —, Pulling up..., "
            "Searching for..., On the page now, Tapping..., Reading..., That's done.\n"
            "Sound like a person helping, not a machine logging. "
            "No exclamation marks. No filler words like just or now. Short and direct.\n\n"
            "Good: 'Found the refill form, filling it in'\n"
            "Good: 'Your balance is $127 — selecting your saved bank account'\n"
            "Good: 'Pulling up the Medicare doctor finder'\n"
            "Bad: 'I am now navigating to the pharmacy section of the website'"
        )
        try:
            result = self._ask(prompt, language).strip()
            # If Gemini says skip, return empty string — caller should not yield this
            if result.upper().startswith("SKIP"):
                return ""
            return result
        except Exception:
            return ""

    def simplify_result(self, technical_result: str, language: str = "en-US") -> str:
        """Convert raw agent output into a plain language summary."""
        truncated = technical_result[:3000] if len(technical_result) > 3000 else technical_result
        prompt = (
            f"A browser assistant just completed a task. Here is the raw output:\n"
            f'"{truncated}"\n\n'
            f"Write a 1-2 sentence friendly summary of what was accomplished or found, "
            f"in simple language a grandparent would understand. "
            f"Focus on what matters to the person, not technical details."
        )
        try:
            return self._ask(prompt, language)
        except Exception:
            return "I've finished that step. Let me know what you'd like to do next."

    def generate_confirmation_request(
        self, action: str, context: str, language: str = "en-US"
    ) -> str:
        """Generate a friendly confirmation question for a risky action."""
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
            return self._ask(prompt, language)
        except Exception:
            return f"I'm about to {action}. Shall I go ahead?"

    def classify_action_risk(self, action: str) -> str:
        """
        Classify the risk of an action.
        Returns: "safe" | "confirm_needed" | "stop"
        Risk classification is always done in English (it's internal logic, not user-facing).
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
            # Risk classification always in English — it's an internal decision
            result = self._ask(prompt, language="en-US").strip().lower()
            if result in ("safe", "confirm_needed", "stop"):
                return result
        except Exception:
            pass

        return "safe"

    def clean_voice_transcript(self, raw_transcript: str, language: str = "en-US") -> str:
        """Clean up imperfect speech-to-text transcript into a clear instruction."""
        prompt = (
            f"A speech-to-text system recorded this from a user:\n"
            f'"{raw_transcript}"\n\n'
            f"Clean this up into a clear, complete instruction for a web assistant. "
            f"Fix any obvious speech-to-text errors. Remove filler words like 'um', 'uh', 'like'. "
            f"Keep the user's intent. Return just the cleaned instruction, nothing else."
        )
        try:
            # Return the cleaned transcript in the same language it was spoken
            return self._ask(prompt, language)
        except Exception:
            return raw_transcript

    def friendly_error(self, technical_error: str, language: str = "en-US") -> str:
        """Convert a technical error into a friendly message."""
        prompt = (
            f"A web assistant encountered this error:\n"
            f'"{technical_error}"\n\n'
            f"Write a short, friendly apology message (1 sentence) that tells the user something "
            f"went wrong without using any technical terms. Suggest they try again. "
            f"Be warm and reassuring."
        )
        try:
            return self._ask(prompt, language)
        except Exception:
            return "I'm sorry, something went wrong. Please tap the button and try again."


# ─── Standalone test ───────────────────────────────────────────────────────────
if __name__ == "__main__":
    print("Testing Narrationifier (English + Spanish)...\n")
    n = Narrationifier()

    tests_en = [
        ("simplify_action", "clicking element #btn-submit-prescription at coordinates 450,230"),
        ("simplify_action", "navigating to https://www.cvs.com/pharmacy/rx-history"),
        ("simplify_result", "HTTP 200 OK. Form submitted. Response: {'status': 'success', 'refill_id': 'RX-8821', 'medication': 'Lisinopril 10mg'}"),
        ("generate_confirmation_request", "submit prescription refill form", "Medication: Lisinopril 10mg, Quantity: 30 tablets"),
        ("friendly_error", "ConnectionRefusedError: [Errno 111] Connection refused at port 9222"),
    ]

    print("── English ──────────────────────────────────")
    for method, *args in tests_en:
        fn = getattr(n, method)
        result = fn(*args, language="en-US")
        print(f"[{method}]\n  IN:  {args[0][:70]}\n  OUT: {result}\n")

    print("── Spanish ──────────────────────────────────")
    for method, *args in tests_en:
        fn = getattr(n, method)
        result = fn(*args, language="es-US")
        print(f"[{method}]\n  IN:  {args[0][:70]}\n  OUT: {result}\n")