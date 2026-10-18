"""Delivery metrics from Whisper word timestamps and the browser's mic level."""

import re
from dataclasses import dataclass, field

import numpy as np

from . import thresholds as T
from .series import Frames

# "like", "kind of" and "sort of" are left out on purpose: they're too often real words.
FILLER_WORDS = {"um", "umm", "uh", "uhh", "uhm", "erm", "er", "ah", "hmm", "hm", "mm", "mhm"}
FILLER_PHRASES = (("you", "know"), ("i", "mean"))


@dataclass
class Word:
    text: str
    start: float
    end: float
    filler: bool = False


@dataclass
class SpeechAnalysis:
    words: list[Word]
    fillers: list[Word]
    pace_runs: list[dict] = field(default_factory=list)  # {start, end, wpm, kind}
    filler_runs: list[dict] = field(default_factory=list)  # {start, end, count, words}
    pauses: list[dict] = field(default_factory=list)  # {start, end}
    metrics: dict = field(default_factory=dict)


def _norm(text: str) -> str:
    return re.sub(r"[^a-z']", "", text.lower())


def parse_words(raw_words: list[dict]) -> list[Word]:
    words = []
    for w in raw_words or []:
        text = str(w.get("word", "")).strip()
        if not text:
            continue
        words.append(Word(text=text, start=float(w.get("start", 0)), end=float(w.get("end", 0))))
    for i, w in enumerate(words):
        n = _norm(w.text)
        if n in FILLER_WORDS:
            w.filler = True
        elif i + 1 < len(words):
            pair = (n, _norm(words[i + 1].text))
            if pair in FILLER_PHRASES:
                w.filler = True
    return words


def speaking_mask(frames: Frames) -> np.ndarray:
    """1/0 per frame: is the mic picking up speech? NaN when there's no level data."""
    level = frames["level"]
    finite = level[np.isfinite(level)]
    if len(finite) < 10:
        return np.full(len(frames), np.nan)
    floor = float(np.percentile(finite, 20))
    threshold = max(T.SPEECH_LEVEL_MIN, floor * T.SPEECH_LEVEL_FLOOR_MULT)
    out = np.where(level > threshold, 1.0, 0.0)
    out[~np.isfinite(level)] = np.nan
    return out


def _pauses_from_level(frames: Frames) -> list[dict]:
    speaking = speaking_mask(frames)
    t = frames.t
    idx = np.where(speaking == 1.0)[0]
    if len(idx) < 2:
        return []
    pauses = []
    gaps = np.diff(t[idx])
    for k in np.where(gaps >= T.PAUSE_FLAG_S)[0]:
        pauses.append({"start": float(t[idx[k]]), "end": float(t[idx[k + 1]])})
    return pauses


def _pauses_from_words(words: list[Word]) -> list[dict]:
    pauses = []
    for a, b in zip(words, words[1:]):
        if b.start - a.end >= T.PAUSE_FLAG_S:
            pauses.append({"start": a.end, "end": b.start})
    return pauses


def _merge_windows(windows: list[tuple[float, float, float]], kind: str) -> list[dict]:
    """Join overlapping (start, end, wpm) windows into runs with an average wpm."""
    runs: list[dict] = []
    for start, end, wpm in windows:
        if runs and start <= runs[-1]["end"]:
            run = runs[-1]
            run["end"] = max(run["end"], end)
            run["_wpms"].append(wpm)
        else:
            runs.append({"start": start, "end": end, "kind": kind, "_wpms": [wpm]})
    for run in runs:
        run["wpm"] = round(float(np.mean(run.pop("_wpms"))))
    return runs


def analyze_speech(raw_words: list[dict], frames: Frames) -> SpeechAnalysis:
    words = parse_words(raw_words)
    fillers = [w for w in words if w.filler]
    content = [w for w in words if not w.filler]
    result = SpeechAnalysis(words=words, fillers=fillers)

    # Pauses: trust the mic level when we have it, Whisper's gaps otherwise.
    pauses = _pauses_from_level(frames) if np.isfinite(frames["level"]).any() else []
    result.pauses = pauses or _pauses_from_words(words)

    # Pace in sliding windows, skipping windows that contain a long pause.
    fast, slow = [], []
    evaluated = ideal = 0
    ideal_lo, ideal_hi = T.PACE_IDEAL
    if content:
        first, last = content[0].start, content[-1].end
        starts = np.array([w.start for w in content])
        x = first
        while x + T.PACE_WINDOW_S <= last + 0.5:
            end = x + T.PACE_WINDOW_S
            has_pause = any(p["start"] < end and p["end"] > x for p in result.pauses)
            if not has_pause:
                count = int(((starts >= x) & (starts < end)).sum())
                wpm = count * 60.0 / T.PACE_WINDOW_S
                evaluated += 1
                ideal += ideal_lo <= wpm <= ideal_hi
                if wpm > T.PACE_FAST_WPM:
                    fast.append((x, end, wpm))
                elif wpm < T.PACE_SLOW_WPM:
                    slow.append((x, end, wpm))
            x += 1.0
    result.pace_runs = _merge_windows(fast, "fast") + _merge_windows(slow, "slow")

    # Filler clusters: N or more fillers inside one window.
    used: set[int] = set()
    for i, w in enumerate(fillers):
        if i in used:
            continue
        group = [j for j in range(i, len(fillers)) if fillers[j].start - w.start <= T.FILLER_WINDOW_S]
        if len(group) >= T.FILLER_FLAG_COUNT:
            used.update(group)
            result.filler_runs.append({
                "start": w.start,
                "end": fillers[group[-1]].end,
                "count": len(group),
                "words": [fillers[j].text.strip(",.?!").lower() for j in group],
            })

    # Session-level numbers for scoring and the report.
    speaking_s = 0.0
    if content:
        speaking_s = max(1e-6, content[-1].end - content[0].start - sum(p["end"] - p["start"] for p in result.pauses))
    minutes = speaking_s / 60.0 if speaking_s else 0.0
    result.metrics = {
        "word_count": len(content),
        "speaking_s": round(speaking_s, 1),
        "wpm": round(len(content) / minutes) if minutes else None,
        # Share of 10-second stretches spoken at a comfortable pace (None if too short to judge).
        "pace_score": round(ideal / evaluated, 3) if evaluated else None,
        "filler_count": len(fillers),
        "fillers_per_min": round(len(fillers) / minutes, 2) if minutes else None,
        "long_pauses": len(result.pauses),
        "longest_pause_s": round(max((p["end"] - p["start"] for p in result.pauses), default=0.0), 1),
    }
    return result
