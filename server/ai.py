"""CometAPI clients. One key covers Whisper and TTS (OpenAI SDK) and Claude (Anthropic SDK)."""

from functools import lru_cache

import anthropic
from openai import OpenAI

from .config import get_settings

# Whisper tends to drop "um"/"uh"; a prompt full of fillers nudges it to keep them.
FILLER_PROMPT = "Umm, let me think like, hmm... Okay, here's what I'm, uh, thinking. So, um, you know, I mean..."

TTS_INSTRUCTIONS = (
    "You are a warm, professional interviewer. Speak clearly at a natural, unhurried pace, "
    "with a friendly and encouraging tone."
)


@lru_cache
def openai_client() -> OpenAI:
    s = get_settings()
    return OpenAI(api_key=s.comet_key, base_url=f"{s.comet_base_url}/v1", timeout=120.0, max_retries=2)


@lru_cache
def claude_client() -> anthropic.Anthropic:
    s = get_settings()
    # CometAPI exposes Anthropic's Messages API at {base}/v1/messages.
    return anthropic.Anthropic(api_key=s.comet_key, base_url=s.comet_base_url, timeout=240.0, max_retries=1)


def _words_from_segments(segments) -> list[dict]:
    """Fallback when word timestamps aren't returned: spread each segment's words evenly."""
    words = []
    for seg in segments or []:
        tokens = str(seg.text).split()
        if not tokens:
            continue
        step = (seg.end - seg.start) / len(tokens)
        for i, tok in enumerate(tokens):
            words.append({"word": tok, "start": seg.start + i * step, "end": seg.start + (i + 1) * step})
    return words


def transcribe(audio: bytes, filename: str, mime: str) -> dict:
    s = get_settings()
    r = openai_client().audio.transcriptions.create(
        model=s.stt_model,
        file=(filename, audio, mime),
        response_format="verbose_json",
        timestamp_granularities=["word", "segment"],
        language="en",
        prompt=FILLER_PROMPT,
        temperature=0,
    )
    words = [{"word": w.word, "start": w.start, "end": w.end} for w in (r.words or [])]
    exact = bool(words)
    if not words:
        words = _words_from_segments(r.segments)
    return {"text": (r.text or "").strip(), "words": words, "word_timestamps": exact}


def plausible(transcript: dict, duration_s: float) -> bool:
    """Whisper invents speech for silent clips, often by repeating its own prompt. Catch the obvious cases."""
    words = [w["word"].strip(",.?!").lower() for w in transcript["words"]]
    if duration_s > 0 and len(words) > 6 * duration_s:  # faster than anyone talks
        return False
    return len(words) < 20 or len(set(words)) / len(words) >= 0.15  # the same few words over and over


def synthesize(text: str) -> bytes:
    s = get_settings()
    r = openai_client().audio.speech.create(
        model=s.tts_model,
        voice=s.tts_voice,
        input=text,
        instructions=TTS_INSTRUCTIONS,
        response_format="mp3",
    )
    return r.content
