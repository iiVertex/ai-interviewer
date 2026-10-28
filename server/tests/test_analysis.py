import math
import random

from server.analysis import analyze_answer, select_flags, session_scores
from server.analysis import thresholds as T
from server.questions import pick_questions

FPS = 10
CALIBRATION = {"yaw": 0.0, "pitch": 0.0, "gaze_h": 0.0, "gaze_v": 0.0, "neck": 1.0, "tilt": 0.0, "face_w": 0.3}


def make_signals(duration=60.0, look_away=(20, 30), flat=(30, 50), slouch=(40, 50), silence=(12, 17)):
    rng = random.Random(1)
    n = int(duration * FPS)
    frames = {k: [] for k in (
        "t", "face", "yaw", "pitch", "roll", "gaze_h", "gaze_v", "blink", "smile", "brow", "cheek",
        "mouth", "face_cx", "face_cy", "face_w", "light", "pose", "neck", "tilt", "motion", "level",
    )}
    for i in range(n):
        t = i / FPS
        inside = lambda r: r[0] <= t < r[1]
        frames["t"].append(t)
        frames["face"].append(1)
        frames["yaw"].append(30.0 if inside(look_away) else rng.uniform(-3, 3))
        frames["pitch"].append(rng.uniform(-3, 3))
        frames["roll"].append(rng.uniform(-1, 1))
        frames["gaze_h"].append(0.5 if inside(look_away) else rng.uniform(-0.05, 0.05))
        frames["gaze_v"].append(rng.uniform(-0.05, 0.05))
        frames["blink"].append(0.1)
        lively = not inside(flat)
        frames["smile"].append(0.1 + (0.1 * math.sin(t * 2) if lively else 0.0))
        frames["brow"].append(0.2 + (0.08 * math.sin(t * 3) if lively else 0.0))
        frames["cheek"].append(0.1 + (0.05 * math.cos(t * 2.5) if lively else 0.0))
        frames["mouth"].append(0.2)
        frames["face_cx"].append(0.5)
        frames["face_cy"].append(0.45)
        frames["face_w"].append(0.3)
        frames["light"].append(0.5)
        frames["pose"].append(1)
        frames["neck"].append(0.7 if inside(slouch) else 1.0)
        frames["tilt"].append(0.0)
        frames["motion"].append(0.05)
        frames["level"].append(0.002 if inside(silence) else rng.uniform(0.05, 0.12))
    return {"version": 1, "fps": FPS, "duration_s": duration, "calibration": CALIBRATION, "frames": frames}


def make_words(duration=60.0, silence=(12, 17), fillers_at=(5.0, 6.0, 7.0)):
    words, t = [], 0.5
    while t < duration - 0.5:
        if silence[0] <= t < silence[1]:
            t = silence[1]
            continue
        words.append({"word": f"word{len(words)}", "start": t, "end": t + 0.3})
        t += 0.4  # 150 words per minute
    for ft in fillers_at:
        words.append({"word": "um", "start": ft + 0.05, "end": ft + 0.15})
    return sorted(words, key=lambda w: w["start"])


def flagged(result, signal):
    return [c for c in result["candidates"] if c["signal"] == signal]


def test_detects_the_planted_problems():
    result = analyze_answer(0, make_signals(), make_words(), "test")

    eye = flagged(result, "eye_contact")
    assert len(eye) == 1 and 19 <= eye[0]["start_s"] <= 21 and 28 <= eye[0]["end_s"] <= 31
    assert eye[0]["screenshot"] is True and 20 <= eye[0]["worst_s"] <= 30

    flat = flagged(result, "flat_face")
    assert flat and flat[0]["start_s"] >= 29 and flat[0]["end_s"] <= 51

    slouch = flagged(result, "slouching")
    assert slouch and 39 <= slouch[0]["start_s"] <= 41

    pauses = flagged(result, "pause")
    assert len(pauses) == 1 and 11.5 <= pauses[0]["start_s"] <= 12.5
    assert pauses[0]["screenshot"] is False

    fillers = flagged(result, "fillers")
    assert len(fillers) == 1 and "3 filler words" in fillers[0]["message"]

    assert not flagged(result, "pace_fast") and not flagged(result, "pace_slow")
    assert not flagged(result, "restless_head")  # jitter alone isn't head movement
    assert not flagged(result, "no_face") and not flagged(result, "too_dark")


def test_metrics_and_scores_are_sane():
    result = analyze_answer(0, make_signals(), make_words(), "test")
    m = result["metrics"]
    assert 0.75 <= m["eye_contact_pct"] <= 0.9  # 10 of 60 seconds looking away
    assert m["filler_count"] == 3
    assert 140 <= m["wpm"] <= 160
    for value in result["scores"].values():
        assert value is None or 0 <= value <= 100
    assert result["scores"]["content"] is None
    assert len(result["timeline"]["eye_contact"]) == 60


def test_highlight_found_in_clean_stretch():
    signals = make_signals(look_away=(100, 101), flat=(100, 101), slouch=(100, 101), silence=(100, 101))
    words = make_words(silence=(100, 101), fillers_at=())
    result = analyze_answer(2, signals, words, "clean")
    h = result["highlight"]
    assert h is not None and h["kind"] == "highlight" and h["answer_idx"] == 2


def test_select_flags_caps_and_orders():
    candidates = [
        {"id": f"x{i}", "kind": "issue", "answer_idx": i % 3, "signal": "pause" if i % 2 else "eye_contact",
         "start_s": float(i), "severity": i / 20}
        for i in range(20)
    ]
    highlights = [
        {"id": "h1", "kind": "highlight", "answer_idx": 0, "start_s": 1.0, "severity": 0.9},
        {"id": "h2", "kind": "highlight", "answer_idx": 0, "start_s": 5.0, "severity": 0.8},
        {"id": "h3", "kind": "highlight", "answer_idx": 1, "start_s": 2.0, "severity": 0.7},
    ]
    chosen = select_flags(candidates, highlights)
    issues = [c for c in chosen if c["kind"] == "issue"]
    assert len(issues) == min(T.MAX_ISSUE_FLAGS, 2 * T.MAX_FLAGS_PER_SIGNAL)
    assert {h["id"] for h in chosen if h["kind"] == "highlight"} == {"h1", "h3"}
    keys = [(c["answer_idx"], c["start_s"]) for c in chosen]
    assert keys == sorted(keys)


def test_session_scores_weighting():
    answers = [
        {"duration_s": 30, "scores": {"eye_contact": 100, "delivery": None}},
        {"duration_s": 90, "scores": {"eye_contact": 60, "delivery": 80}},
    ]
    s = session_scores(answers)
    assert s["eye_contact"] == 70
    assert s["delivery"] == 80
    assert s["overall"] == 75


def test_empty_answer_does_not_crash():
    result = analyze_answer(1, {"frames": {"t": []}, "duration_s": 0}, [], "")
    assert result["candidates"] == []
    assert result["highlight"] is None


def test_question_picking():
    rng = random.Random(3)
    job = pick_questions("job", {"role": "Data Analyst"}, 5, rng)
    assert len(job) == 5 and len({q["id"] for q in job}) == 5
    assert job[0]["id"] == "job-01" and "the Data Analyst role" in job[0]["text"]
    student = pick_questions("student", {"student_type": "scholarship"}, 5, rng)
    ids = {q["id"] for q in student}
    assert len(student) == 5 and {"stu-09", "stu-10"} <= ids
    assert len(pick_questions("student", {}, 5, rng)) == 5
    assert len(pick_questions("communication", {}, 5, rng)) == 5
