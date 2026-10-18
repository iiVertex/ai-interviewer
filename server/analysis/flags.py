"""Rule-based flagging: find the weak (and strong) moments in an answer, then pick the
ones worth showing for the whole session. No AI involved."""

import warnings

import numpy as np

from . import thresholds as T
from . import vision
from .series import Frames, find_runs, fraction
from .speech import SpeechAnalysis, Word
from .tips import HIGHLIGHT_TIP, SIGNALS


def _clamp(x: float) -> float:
    return float(min(1.0, max(0.0, x)))


def _flag(answer_idx: int, signal: str, start: float, end: float, worst: float, severity: float,
          screenshot: bool, excerpt: str | None = None, **fmt) -> dict:
    meta = SIGNALS[signal]
    dur = max(1, round(end - start))
    return {
        "id": f"a{answer_idx}-{signal}-{int(start * 10)}",
        "kind": "issue",
        "answer_idx": answer_idx,
        "signal": signal,
        "category": meta["category"],
        "label": meta["label"],
        "start_s": round(start, 1),
        "end_s": round(end, 1),
        "worst_s": round(worst, 1),
        "severity": round(_clamp(severity), 3),
        "message": meta["message"].format(dur=dur, **fmt),
        "tip": meta["tip"],
        "screenshot": screenshot,
        "excerpt": excerpt,
    }


def _worst(t: np.ndarray, s: int, e: int, score: np.ndarray | None, highest: bool = True) -> float:
    """Time of the worst frame in [s, e] by `score`, or the midpoint if there's no score."""
    if score is not None:
        chunk = score[s:e + 1]
        if np.isfinite(chunk).any():
            k = int(np.nanargmax(chunk) if highest else np.nanargmin(chunk))
            return float(t[s + k])
    return float((t[s] + t[e]) / 2)


def _excerpt(words: list[Word], start: float, end: float) -> str | None:
    picked = [w.text.strip() for w in words if w.end >= start - 1 and w.start <= end + 1]
    return " ".join(picked) if picked else None


def visual_flags(idx: int, f: Frames) -> list[dict]:
    t = f.t
    flags: list[dict] = []
    if len(t) < 2:
        return flags

    contact = vision.eye_contact(f)
    deviation = (
        np.abs(f["yaw"] - f.calib("yaw", 0.0)) / T.EYE_YAW_TOL_DEG
        + np.abs(f["gaze_h"] - f.calib("gaze_h", 0.0)) / T.EYE_GAZE_H_TOL
    )
    for s, e in find_runs(t, 1.0 - contact, T.EYE_FLAG_MIN_S, T.MERGE_GAP_S):
        pct = fraction(contact[s:e + 1]) or 0.0
        if pct > T.EYE_FLAG_MAX_FRACTION:
            continue
        dur = t[e] - t[s]
        flags.append(_flag(idx, "eye_contact", t[s], t[e], _worst(t, s, e, deviation),
                           0.5 * (1 - pct) + 0.5 * min(1, dur / 15), True, pct=round(pct * 100)))

    for s, e in find_runs(t, vision.flat_face(f), T.EXPR_FLAG_MIN_S, T.MERGE_GAP_S):
        dur = t[e] - t[s]
        flags.append(_flag(idx, "flat_face", t[s], t[e], _worst(t, s, e, None),
                           0.3 + 0.7 * min(1, dur / 45), True))

    speed = vision.head_speed(f)
    for s, e in find_runs(t, vision.restless_head(f), T.HEAD_FLAG_MIN_S, T.MERGE_GAP_S):
        dur = t[e] - t[s]
        mean_speed = float(np.nanmean(speed[s:e + 1])) if np.isfinite(speed[s:e + 1]).any() else 0.0
        flags.append(_flag(idx, "restless_head", t[s], t[e], _worst(t, s, e, speed),
                           0.5 * min(1, mean_speed / 70) + 0.5 * min(1, dur / 15), True))

    for s, e in find_runs(t, vision.slouching(f), T.POSTURE_FLAG_MIN_S, T.MERGE_GAP_S):
        dur = t[e] - t[s]
        flags.append(_flag(idx, "slouching", t[s], t[e], _worst(t, s, e, f["neck"], highest=False),
                           0.4 + 0.6 * min(1, dur / 30), True))

    tilt_dev = np.abs(f["tilt"] - f.calib("tilt", 0.0))
    for s, e in find_runs(t, vision.leaning(f), T.POSTURE_FLAG_MIN_S, T.MERGE_GAP_S):
        dur = t[e] - t[s]
        flags.append(_flag(idx, "leaning", t[s], t[e], _worst(t, s, e, tilt_dev),
                           0.35 + 0.6 * min(1, dur / 30), True))

    level = vision.fidget_level(f)
    for s, e in find_runs(t, vision.fidgeting(f), T.FIDGET_FLAG_MIN_S, T.MERGE_GAP_S):
        dur = t[e] - t[s]
        mean_level = float(np.nanmean(level[s:e + 1])) if np.isfinite(level[s:e + 1]).any() else 0.0
        flags.append(_flag(idx, "fidgeting", t[s], t[e], _worst(t, s, e, level),
                           0.5 * min(1, mean_level / 0.8) + 0.5 * min(1, dur / 15), True))

    base = {"no_face": 0.85, "too_dark": 0.6}
    for issue, bad in vision.framing_issue(f).items():
        for s, e in find_runs(t, bad, T.FRAME_FLAG_MIN_S, T.MERGE_GAP_S):
            dur = t[e] - t[s]
            flags.append(_flag(idx, issue, t[s], t[e], _worst(t, s, e, None),
                               base.get(issue, 0.45) + 0.15 * min(1, dur / 15), True))
    return flags


def speech_flags(idx: int, sp: SpeechAnalysis) -> list[dict]:
    flags: list[dict] = []
    for run in sp.pace_runs:
        bound = T.PACE_FAST_WPM if run["kind"] == "fast" else T.PACE_SLOW_WPM
        mid = (run["start"] + run["end"]) / 2
        flags.append(_flag(idx, f"pace_{run['kind']}", run["start"], run["end"], mid,
                           0.4 + 0.6 * min(1, abs(run["wpm"] - bound) / 50), False,
                           _excerpt(sp.words, run["start"], run["end"]), wpm=run["wpm"]))
    for run in sp.filler_runs:
        unique = list(dict.fromkeys(run["words"]))
        quoted = ", ".join(f'"{w}"' for w in unique[:3])
        flags.append(_flag(idx, "fillers", run["start"], run["end"], run["start"],
                           0.4 + 0.6 * min(1, (run["count"] - 2) / 4), False,
                           _excerpt(sp.words, run["start"], run["end"]), count=run["count"], words=quoted))
    for p in sp.pauses:
        dur = p["end"] - p["start"]
        flags.append(_flag(idx, "pause", p["start"], p["end"], (p["start"] + p["end"]) / 2,
                           0.3 + 0.7 * min(1, (dur - T.PAUSE_FLAG_S) / 7), False,
                           _excerpt(sp.words, p["start"], p["end"])))
    return flags


def best_moment(idx: int, f: Frames, sp: SpeechAnalysis) -> dict | None:
    """The strongest 10-second stretch of an answer, if one is genuinely good."""
    t = f.t
    if len(t) < 2 or f.duration_s < T.HIGHLIGHT_WINDOW_S:
        return None
    contact = vision.eye_contact(f)
    flat = vision.flat_face(f)
    with warnings.catch_warnings():
        warnings.simplefilter("ignore", RuntimeWarning)  # all-NaN columns are expected
        composure_bad = np.nanmax(
            np.vstack([vision.slouching(f), vision.fidgeting(f), vision.restless_head(f)]), axis=0
        )
    starts = np.array([w.start for w in sp.words if not w.filler])
    filler_starts = np.array([w.start for w in sp.fillers])

    best = None
    x = 0.0
    while x + T.HIGHLIGHT_WINDOW_S <= f.duration_s:
        end = x + T.HIGHLIGHT_WINDOW_S
        m = (t >= x) & (t < end)
        eye = fraction(contact[m])
        valid_share = np.isfinite(contact[m]).mean() if m.any() else 0
        if eye is not None and valid_share >= 0.6 and eye >= 0.8:
            flat_share = fraction(flat[m]) or 0.0
            comp_share = fraction(composure_bad[m]) or 0.0
            words = int(((starts >= x) & (starts < end)).sum()) if len(starts) else 0
            wpm = words * 60 / T.HIGHLIGHT_WINDOW_S
            fillers = int(((filler_starts >= x) & (filler_starts < end)).sum()) if len(filler_starts) else 0
            pace_ok = T.PACE_SLOW_WPM <= wpm <= T.PACE_FAST_WPM
            if flat_share <= 0.2 and comp_share <= 0.1 and fillers == 0 and pace_ok:
                score = eye + (1 - flat_share) + (1 - comp_share)
                if best is None or score > best[0]:
                    best = (score, x, end, eye, wpm)
        x += 2.0
    if best is None:
        return None
    score, start, end, eye, wpm = best
    return {
        "id": f"a{idx}-highlight-{int(start * 10)}",
        "kind": "highlight",
        "answer_idx": idx,
        "signal": "highlight",
        "category": "highlight",
        "label": "Strong moment",
        "start_s": round(start, 1),
        "end_s": round(end, 1),
        "worst_s": round((start + end) / 2, 1),
        "severity": round(score / 3, 3),
        "message": f"Steady eye contact ({round(eye * 100)}%), an expressive face and a confident pace (about {round(wpm)} words/min), with no filler words.",
        "tip": HIGHLIGHT_TIP,
        "screenshot": True,
        "excerpt": _excerpt(sp.words, start, end),
    }


def select_flags(candidates: list[dict], highlights: list[dict]) -> list[dict]:
    """Keep the worst issues for the session (capped per signal) plus the best highlights."""
    chosen: list[dict] = []
    per_signal: dict[str, int] = {}
    for flag in sorted(candidates, key=lambda c: c["severity"], reverse=True):
        if len(chosen) >= T.MAX_ISSUE_FLAGS:
            break
        if per_signal.get(flag["signal"], 0) >= T.MAX_FLAGS_PER_SIGNAL:
            continue
        per_signal[flag["signal"]] = per_signal.get(flag["signal"], 0) + 1
        chosen.append(flag)

    picked: list[dict] = []
    for h in sorted(highlights, key=lambda h: h["severity"], reverse=True):
        if len(picked) >= T.HIGHLIGHT_COUNT:
            break
        if any(p["answer_idx"] == h["answer_idx"] for p in picked):
            continue  # spread highlights across answers
        picked.append(h)

    return sorted(chosen + picked, key=lambda x: (x["answer_idx"], x["start_s"]))
