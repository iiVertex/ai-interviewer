"""0-100 category scores. Placeholder formulas, tuned alongside the thresholds."""

CATEGORIES = ("eye_contact", "expressiveness", "composure", "delivery", "content")


def _clamp(x: float) -> float:
    return min(1.0, max(0.0, x))


def _share_penalty(share: float | None) -> float:
    """0 when the problem never happens, 1 when it covers half the answer or more."""
    return _clamp((share or 0.0) / 0.5)


def answer_scores(m: dict) -> dict[str, int | None]:
    """Scores for one answer from its metrics (content is added later by the AI step)."""
    out: dict[str, int | None] = dict.fromkeys(CATEGORIES)

    if m.get("eye_contact_pct") is not None:
        out["eye_contact"] = round(100 * _clamp((m["eye_contact_pct"] - 0.2) / 0.65))

    if m.get("flat_pct") is not None:
        smile_bonus = _clamp((m.get("smile_pct") or 0.0) / 0.15)
        out["expressiveness"] = round(100 * (0.7 * (1 - m["flat_pct"]) + 0.3 * smile_bonus))

    posture = [m.get("slouch_pct"), m.get("lean_pct")]
    posture_known = [p for p in posture if p is not None]
    if posture_known or m.get("restless_pct") is not None or m.get("fidget_pct") is not None:
        penalty = (
            0.4 * _share_penalty(max(posture_known) if posture_known else 0.0)
            + 0.3 * _share_penalty(m.get("restless_pct"))
            + 0.3 * _share_penalty(m.get("fidget_pct"))
        )
        out["composure"] = round(100 * (1 - penalty))

    if m.get("word_count"):
        fpm = m.get("fillers_per_min") or 0.0
        filler_score = _clamp(1 - (fpm - 2) / 6)  # 2/min or fewer is fine, 8/min is 0
        pause_score = _clamp(1 - m.get("long_pauses", 0) / 4)
        pace = m.get("pace_score")
        if pace is None:
            out["delivery"] = round(100 * (0.6 * filler_score + 0.4 * pause_score))
        else:
            out["delivery"] = round(100 * (0.4 * pace + 0.4 * filler_score + 0.2 * pause_score))
    return out


def session_scores(answers: list[dict]) -> dict[str, int | None]:
    """Duration-weighted mean per category, plus an overall average of the five."""
    out: dict[str, int | None] = {}
    for cat in CATEGORIES:
        total = weight = 0.0
        for a in answers:
            v = (a.get("scores") or {}).get(cat)
            if v is None:
                continue
            w = max(1.0, float(a.get("duration_s") or 1.0))
            total += v * w
            weight += w
        out[cat] = round(total / weight) if weight else None
    known = [v for k, v in out.items() if v is not None]
    out["overall"] = round(sum(known) / len(known)) if known else None
    return out
