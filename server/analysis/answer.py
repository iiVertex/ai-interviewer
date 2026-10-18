"""Analyze one recorded answer: signals + transcript -> metrics, candidate flags, timeline."""

import numpy as np

from . import vision
from .flags import best_moment, speech_flags, visual_flags
from .scores import answer_scores
from .series import fraction, load_frames, per_second
from .speech import analyze_speech, speaking_mask


def analyze_answer(idx: int, signals: dict, words: list[dict], transcript_text: str = "") -> dict:
    f = load_frames(signals)
    sp = analyze_speech(words, f)

    contact = vision.eye_contact(f)
    smile = f["smile"]
    face_frames = f["face"] >= 0.5
    smiling = np.where(np.nan_to_num(smile, nan=0.0) >= 0.3, 1.0, 0.0)
    smiling[~face_frames] = np.nan

    metrics = {
        "duration_s": round(f.duration_s, 1),
        "frames": len(f),
        "face_visible_pct": fraction(np.where(face_frames, 1.0, 0.0)),
        "eye_contact_pct": fraction(contact),
        "flat_pct": fraction(vision.flat_face(f)),
        "smile_pct": fraction(smiling),
        "restless_pct": fraction(vision.restless_head(f)),
        "slouch_pct": fraction(vision.slouching(f)),
        "lean_pct": fraction(vision.leaning(f)),
        "fidget_pct": fraction(vision.fidgeting(f)),
        **sp.metrics,
    }
    metrics = {k: (round(v, 3) if isinstance(v, float) else v) for k, v in metrics.items()}

    candidates = visual_flags(idx, f) + speech_flags(idx, sp)
    return {
        "metrics": metrics,
        "scores": answer_scores(metrics),
        "candidates": candidates,
        "highlight": best_moment(idx, f, sp),
        "timeline": {
            "eye_contact": per_second(f.t, contact, f.duration_s),
            "speaking": per_second(f.t, speaking_mask(f), f.duration_s),
        },
        "transcript": {
            "text": transcript_text,
            "words": [
                {"w": w.text, "s": round(w.start, 2), "e": round(w.end, 2), **({"f": 1} if w.filler else {})}
                for w in sp.words
            ],
        },
    }
