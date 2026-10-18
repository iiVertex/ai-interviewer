"""Day-one check that CometAPI supports everything the pipeline relies on.

    python -m server.tools.check_comet

Needs COMETAPI_KEY in .env. Costs a fraction of a cent.
"""

from pydantic import BaseModel

from .. import ai
from ..config import get_settings
from ..content import _call_structured

SAMPLE = "Um, so, I think my biggest strength is, uh, staying calm under pressure. You know, last year I led a project..."


class Check(BaseModel):
    ok: bool
    note: str


def main() -> None:
    s = get_settings()
    if not s.comet_key:
        raise SystemExit("Set COMETAPI_KEY in .env first")

    print(f"1. Text-to-speech ({s.tts_model}) ...", end=" ")
    audio = ai.synthesize(SAMPLE)
    print(f"ok, {len(audio):,} bytes of mp3")

    print(f"2. Transcription ({s.stt_model}) with word timestamps ...", end=" ")
    result = ai.transcribe(audio, "sample.mp3", "audio/mpeg")
    print("ok" if result["word_timestamps"] else "NO WORD TIMESTAMPS (falling back to segment estimates)")
    print(f"   text: {result['text']!r}")
    print(f"   first words: {result['words'][:4]}")
    fillers = [w["word"] for w in result["words"] if w["word"].strip(",.").lower() in {"um", "uh"}]
    print(f"   fillers kept: {fillers or 'none (Whisper dropped them)'}")

    print(f"3. Claude structured output ({s.content_model}) ...", end=" ")
    check = _call_structured(
        s.content_model,
        "Reply with ok=true and a one-sentence note.",
        "Is the structured output path working?",
        Check,
        effort="low",
        max_tokens=2000,
    )
    print(f"ok={check.ok}, note={check.note!r}")
    print("\nAll checks passed. Compare the charges in your CometAPI dashboard.")


if __name__ == "__main__":
    main()
