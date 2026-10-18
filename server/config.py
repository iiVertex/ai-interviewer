"""Environment-driven settings. Locally these come from the repo-root .env file."""

import os
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path


def _load_dotenv() -> None:
    env_file = Path(__file__).resolve().parent.parent / ".env"
    if not env_file.exists():
        return
    for line in env_file.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


def _flag(name: str, default: bool) -> bool:
    return os.environ.get(name, str(default)).strip().lower() in {"1", "true", "yes", "on"}


@dataclass(frozen=True)
class Settings:
    supabase_url: str
    supabase_service_key: str
    comet_key: str
    comet_base_url: str
    stt_model: str
    tts_model: str
    tts_voice: str
    content_model: str
    question_model: str
    enable_jd_questions: bool
    default_daily_limit: int


@lru_cache
def get_settings() -> Settings:
    _load_dotenv()
    return Settings(
        supabase_url=os.environ.get("SUPABASE_URL", ""),
        supabase_service_key=os.environ.get("SUPABASE_SERVICE_ROLE_KEY", ""),
        comet_key=os.environ.get("COMETAPI_KEY", ""),
        comet_base_url=os.environ.get("COMETAPI_BASE_URL", "https://api.cometapi.com").rstrip("/"),
        stt_model=os.environ.get("STT_MODEL", "whisper-1"),
        tts_model=os.environ.get("TTS_MODEL", "gpt-4o-mini-tts"),
        tts_voice=os.environ.get("TTS_VOICE", "alloy"),
        content_model=os.environ.get("CONTENT_MODEL", "claude-sonnet-5-5"),
        question_model=os.environ.get("QUESTION_MODEL", "claude-haiku-5-5"),
        enable_jd_questions=_flag("ENABLE_JD_QUESTIONS", False),
        default_daily_limit=int(os.environ.get("DEFAULT_DAILY_LIMIT", "5")),
    )
