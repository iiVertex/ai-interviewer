"""Re-run the analysis on saved sessions to tune thresholds without re-recording.

    python -m server.tools.replay SESSION_ID          # pulls signals + transcripts from Supabase
    python -m server.tools.replay signals.json         # a local signals file (no transcript)

Edit server/analysis/thresholds.py and run again to see how the flags change.
"""

import json
import sys
from pathlib import Path

from ..analysis import analyze_answer, select_flags, session_scores
from ..deps import get_db


def _print_answer(idx: int, result: dict) -> None:
    print(f"\n=== Answer {idx}  scores={result['scores']}")
    m = result["metrics"]
    print(f"    eye {m['eye_contact_pct']}  flat {m['flat_pct']}  slouch {m['slouch_pct']}  "
          f"fidget {m['fidget_pct']}  wpm {m['wpm']}  fillers {m['filler_count']}  pauses {m['long_pauses']}")
    for c in result["candidates"]:
        print(f"    [{c['severity']:.2f}] {c['start_s']:>6.1f}-{c['end_s']:<6.1f} {c['signal']:<14} {c['message']}")
    if result["highlight"]:
        h = result["highlight"]
        print(f"    [best] {h['start_s']:>6.1f}-{h['end_s']:<6.1f} {h['message']}")


def replay_session(sid: str) -> None:
    db = get_db()
    session = db.table("sessions").select("*").eq("id", sid).single().execute().data
    answers = db.table("session_answers").select("*").eq("session_id", sid).order("idx").execute().data
    results = []
    for a in answers:
        raw = db.storage.from_("signals").download(f"{session['user_id']}/{sid}/answer-{a['idx']}.json")
        words = [{"word": w["w"], "start": w["s"], "end": w["e"]} for w in (a["transcript"] or {}).get("words", [])]
        result = analyze_answer(a["idx"], json.loads(raw), words, (a["transcript"] or {}).get("text", ""))
        result["duration_s"] = result["metrics"]["duration_s"]
        _print_answer(a["idx"], result)
        results.append(result)
    candidates = [c for r in results for c in r["candidates"]]
    highlights = [r["highlight"] for r in results if r["highlight"]]
    print(f"\nSession scores (no content): {session_scores(results)}")
    print("Chosen flags:")
    for f in select_flags(candidates, highlights):
        print(f"    answer {f['answer_idx']} {f['start_s']:>6.1f}s {f['kind']:<9} {f['message']}")


def main() -> None:
    if len(sys.argv) != 2:
        raise SystemExit(__doc__)
    target = sys.argv[1]
    if Path(target).exists():
        _print_answer(0, analyze_answer(0, json.loads(Path(target).read_text(encoding="utf-8")), []))
    else:
        replay_session(target)


if __name__ == "__main__":
    main()
