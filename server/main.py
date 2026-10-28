"""FastAPI app: session lifecycle, analysis pipeline and the built frontend.

Flow after a session (driven by the browser):
  1. POST /api/sessions/{id}/answers/{idx}  per answer: audio + signals -> transcript + analysis
  2. POST /api/sessions/{id}/analyze        pick flags, compute scores -> browser grabs screenshots
  3. POST /api/sessions/{id}/score          one Claude call for content -> report ready
"""

import hashlib
import json
import logging
from datetime import datetime, timedelta, timezone
from typing import Literal

import httpx
from fastapi import Depends, FastAPI, File, HTTPException, UploadFile
from pydantic import BaseModel, Field
from supabase import Client

from . import ai
from .analysis import analyze_answer, select_flags, session_scores
from .config import get_settings
from .content import generate_questions, score_content
from .deps import User, current_user, get_db
from .questions import pick_questions

log = logging.getLogger("interview-coach")

app = FastAPI(title="Interview Coach API")

QUESTIONS_PER_SESSION = 5
MAX_AUDIO_BYTES = 4_000_000  # Vercel caps request bodies at 4.5 MB
MAX_SIGNAL_BYTES = 3_000_000


class SessionConfig(BaseModel):
    role: str | None = Field(default=None, max_length=120)
    seniority: Literal["intern", "junior", "mid", "senior"] | None = None
    job_description: str | None = Field(default=None, max_length=12000)
    student_type: Literal["internship", "college", "scholarship"] | None = None


class CreateSession(BaseModel):
    mode: Literal["job", "student", "communication"]
    config: SessionConfig = SessionConfig()


# The consent notice changed on this date (answer videos are now stored for replay), so
# anyone who accepted the earlier version is asked again.
CONSENT_UPDATED = datetime(2026, 10, 24, tzinfo=timezone.utc)


def _consented(profile: dict) -> bool:
    at = profile.get("consented_at")
    return at is not None and datetime.fromisoformat(at) >= CONSENT_UPDATED


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _profile(db: Client, user: User) -> dict:
    rows = db.table("profiles").select("*").eq("id", user.id).limit(1).execute().data
    if rows:
        return rows[0]
    row = {"id": user.id, "daily_session_limit": get_settings().default_daily_limit}
    return db.table("profiles").upsert(row).execute().data[0]


def _used_last_day(db: Client, user: User) -> int:
    since = (_now() - timedelta(hours=24)).isoformat()
    res = db.table("sessions").select("id", count="exact").eq("user_id", user.id).gte("created_at", since).execute()
    return res.count or 0


def _session(db: Client, user: User, sid: str) -> dict:
    rows = db.table("sessions").select("*").eq("id", sid).eq("user_id", user.id).limit(1).execute().data
    if not rows:
        raise HTTPException(404, "Session not found")
    return rows[0]


def _answers(db: Client, sid: str) -> list[dict]:
    return db.table("session_answers").select("*").eq("session_id", sid).order("idx").execute().data


@app.get("/api/health")
def health() -> dict:
    return {"ok": True}


@app.get("/api/me")
def me(user: User = Depends(current_user), db: Client = Depends(get_db)) -> dict:
    profile = _profile(db, user)
    return {
        "id": user.id,
        "email": user.email,
        "consented": _consented(profile),
        "daily_limit": profile["daily_session_limit"],
        "used_today": _used_last_day(db, user),
    }


@app.post("/api/consent")
def consent(user: User = Depends(current_user), db: Client = Depends(get_db)) -> dict:
    _profile(db, user)
    db.table("profiles").update({"consented_at": _now().isoformat()}).eq("id", user.id).execute()
    return {"ok": True}


@app.post("/api/sessions")
def create_session(body: CreateSession, user: User = Depends(current_user), db: Client = Depends(get_db)) -> dict:
    profile = _profile(db, user)
    if not _consented(profile):
        raise HTTPException(403, "Please accept the consent notice first")
    if _used_last_day(db, user) >= profile["daily_session_limit"]:
        raise HTTPException(429, f"You've reached your limit of {profile['daily_session_limit']} sessions in 24 hours")

    config = body.config.model_dump(exclude_none=True)
    questions = pick_questions(body.mode, config, QUESTIONS_PER_SESSION)
    settings = get_settings()
    if body.mode == "job" and settings.enable_jd_questions and (config.get("role") or config.get("job_description")):
        try:
            generated = generate_questions(config, QUESTIONS_PER_SESSION)
            questions = [{"id": f"gen-{i + 1}", "text": q} for i, q in enumerate(generated)]
        except Exception:
            log.exception("question generation failed; using the bank")

    row = db.table("sessions").insert({
        "user_id": user.id,
        "mode": body.mode,
        "config": config,
        "questions": questions,
        "status": "created",
    }).execute().data[0]
    return {"id": row["id"], "questions": questions}


@app.post("/api/sessions/{sid}/questions/{idx}/audio")
def question_audio(sid: str, idx: int, user: User = Depends(current_user), db: Client = Depends(get_db)) -> dict:
    """Spoken version of a question, cached in public storage so each text is voiced only once."""
    session = _session(db, user, sid)
    if not 0 <= idx < len(session["questions"]):
        raise HTTPException(404, "No such question")
    text = session["questions"][idx]["text"]
    s = get_settings()
    key = hashlib.sha256(f"{s.tts_model}|{s.tts_voice}|{ai.TTS_INSTRUCTIONS}|{text}".encode()).hexdigest()
    path = f"{key}.mp3"
    bucket = db.storage.from_("tts")
    url = bucket.get_public_url(path).rstrip("?")
    try:
        if httpx.head(url, timeout=5.0).status_code == 200:
            return {"url": url, "text": text}
    except httpx.HTTPError:
        pass
    try:
        audio = ai.synthesize(text)
    except Exception as e:
        log.exception("tts failed")
        raise HTTPException(502, f"Text-to-speech failed: {e}")
    bucket.upload(path, audio, {"content-type": "audio/mpeg", "upsert": "true", "cache-control": "31536000"})
    return {"url": url, "text": text}


@app.post("/api/sessions/{sid}/answers/{idx}")
def upload_answer(
    sid: str,
    idx: int,
    audio: UploadFile = File(...),
    signals: UploadFile = File(...),
    user: User = Depends(current_user),
    db: Client = Depends(get_db),
) -> dict:
    session = _session(db, user, sid)
    if not 0 <= idx < len(session["questions"]):
        raise HTTPException(404, "No such question")
    if session["status"] == "ready":
        raise HTTPException(409, "This session is already finished")

    audio_bytes = audio.file.read(MAX_AUDIO_BYTES + 1)
    signal_bytes = signals.file.read(MAX_SIGNAL_BYTES + 1)
    if len(audio_bytes) > MAX_AUDIO_BYTES or len(signal_bytes) > MAX_SIGNAL_BYTES:
        raise HTTPException(413, "Upload too large")
    try:
        signal_data = json.loads(signal_bytes)
    except json.JSONDecodeError:
        raise HTTPException(400, "Signals must be JSON")

    # Keep the raw signals (never video) so thresholds can be re-tuned on real sessions.
    db.storage.from_("signals").upload(
        f"{user.id}/{sid}/answer-{idx}.json", signal_bytes, {"content-type": "application/json", "upsert": "true"}
    )

    transcript = {"text": "", "words": [], "word_timestamps": False}
    if len(audio_bytes) > 2000:  # anything smaller is silence or a broken recording
        mime = (audio.content_type or "audio/webm").split(";")[0]
        ext = {"audio/webm": "webm", "audio/ogg": "ogg", "audio/mp4": "mp4", "audio/wav": "wav"}.get(mime, "webm")
        try:
            transcript = ai.transcribe(audio_bytes, f"answer.{ext}", mime)
        except Exception as e:
            log.exception("transcription failed")
            raise HTTPException(502, f"Transcription failed: {e}")

    result = analyze_answer(idx, signal_data, transcript["words"], transcript["text"])
    db.table("session_answers").upsert({
        "session_id": sid,
        "idx": idx,
        "user_id": user.id,
        "question": session["questions"][idx]["text"],
        "duration_s": result["metrics"]["duration_s"],
        "transcript": result["transcript"],
        "metrics": result["metrics"],
        "scores": result["scores"],
        "candidates": result["candidates"],
        "highlight": result["highlight"],
        "timeline": result["timeline"],
    }).execute()
    return {"ok": True, "word_timestamps": transcript["word_timestamps"]}


@app.post("/api/sessions/{sid}/analyze")
def analyze_session(sid: str, user: User = Depends(current_user), db: Client = Depends(get_db)) -> dict:
    _session(db, user, sid)
    answers = _answers(db, sid)
    if not answers:
        raise HTTPException(400, "No answers uploaded yet")
    candidates = [c for a in answers for c in (a.get("candidates") or [])]
    highlights = [a["highlight"] for a in answers if a.get("highlight")]
    flags = select_flags(candidates, highlights)
    scores = session_scores(answers)
    db.table("sessions").update({"flags": flags, "scores": scores, "status": "processing"}).eq("id", sid).execute()
    return {"flags": flags, "scores": scores}


@app.post("/api/sessions/{sid}/score")
def score_session(sid: str, user: User = Depends(current_user), db: Client = Depends(get_db)) -> dict:
    session = _session(db, user, sid)
    answers = _answers(db, sid)
    if not answers:
        raise HTTPException(400, "No answers uploaded yet")

    content, error = None, None
    try:
        content = score_content(session["mode"], session.get("config") or {}, answers, session.get("flags") or [])
    except Exception as e:  # the report still works without content feedback
        log.exception("content scoring failed")
        error = str(e) or e.__class__.__name__

    if content:
        by_idx = {fb["index"]: fb for fb in content["answers"]}
        for a in answers:
            fb = by_idx.get(a["idx"])
            if fb is None:
                continue
            a["scores"] = {**(a.get("scores") or {}), "content": fb["score"]}
            db.table("session_answers").update({"scores": a["scores"]}).eq("session_id", sid).eq("idx", a["idx"]).execute()

    db.table("sessions").update({
        "content": content,
        "scores": session_scores(answers),
        "status": "ready",
        "error": error,
        "completed_at": _now().isoformat(),
    }).eq("id", sid).execute()
    return {"ok": True, "content_error": error}


@app.delete("/api/sessions/{sid}")
def delete_session(sid: str, user: User = Depends(current_user), db: Client = Depends(get_db)) -> dict:
    _session(db, user, sid)
    for bucket in ("screenshots", "signals", "recordings"):
        folder = f"{user.id}/{sid}"
        files = db.storage.from_(bucket).list(folder)
        paths = [f"{folder}/{f['name']}" for f in files if f.get("name")]
        if paths:
            db.storage.from_(bucket).remove(paths)
    db.table("sessions").delete().eq("id", sid).eq("user_id", user.id).execute()
    return {"ok": True}


# The built React app. API routes above always take precedence.
app.frontend("/", directory="web/dist", fallback="index.html", check_dir=False)
