import json
import os
import re
import logging
from pathlib import Path
from typing import cast
from google import genai
from google.genai import types


logger = logging.getLogger(__name__)

def strip_md_fences(s: str) -> str:
    return re.sub(r"^```(?:\w+)?\s*|\s*```$", "", s.strip(), flags=re.DOTALL)

def _load_api_key() -> str:
    api_key = os.getenv("GOOGLE_API_KEY")
    if not api_key:
        raise RuntimeError("GOOGLE_API_KEY environment variable is not set")
    return api_key


def moderator_ai_response(msg: str) -> str:
    script_dir = Path(__file__).parent
    role_md = script_dir / "Assistant.md"
    markdown_content = role_md.read_text(encoding="utf-8")
    role = markdown_content

    client = genai.Client(api_key=_load_api_key())

    try:
        response = client.models.generate_content(
            model="gemini-2.5-flash",
            config=types.GenerateContentConfig(
                system_instruction=role,
                response_mime_type="application/json",
                temperature=0.2,
            ),
            contents=[
                types.Content(
                    role="user",
                    parts=[types.Part(text=msg)],
                )
            ],
        )
    except Exception as exc:  # pragma: no cover - network failure path
        message = f"{exc.__class__.__name__}: {exc}"
        logger.exception("Gemini moderation request failed: %s", message)
        raise RuntimeError(f"Gemini moderation request failed: {message}") from exc

    text_response = cast(str | None, getattr(response, "text", None))
    if not text_response:
        raise RuntimeError("Gemini moderation response did not contain text")

    cleaned = strip_md_fences(text_response)
    try:
        parsed = json.loads(cleaned)
    except json.JSONDecodeError as exc:
        logger.debug("Gemini moderation returned invalid JSON: %s", cleaned)
        raise RuntimeError("Gemini moderation response was not valid JSON") from exc

    return json.dumps(parsed, ensure_ascii=False)
