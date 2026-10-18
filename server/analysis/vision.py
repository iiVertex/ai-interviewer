"""Per-frame visual signals computed from the MediaPipe features the browser sends.

Each function returns an array aligned with `frames.t`: 1.0 / 0.0 for yes / no,
or NaN where the frame can't tell (no face, eyes closed, shoulders not visible).
"""

import numpy as np

from . import thresholds as T
from .series import Frames, rolling


def _where_valid(valid: np.ndarray, condition: np.ndarray) -> np.ndarray:
    out = np.where(condition, 1.0, 0.0)
    out[~valid] = np.nan
    return out


def eye_contact(f: Frames) -> np.ndarray:
    face = f["face"] >= 0.5
    blink = np.nan_to_num(f["blink"], nan=0.0)
    angles_ok = np.isfinite(f["yaw"]) & np.isfinite(f["pitch"])
    gaze_ok = np.isfinite(f["gaze_h"]) & np.isfinite(f["gaze_v"])
    valid = face & angles_ok & gaze_ok & (blink < T.EYE_BLINK_MAX)
    with np.errstate(invalid="ignore"):
        contact = (
            (np.abs(f["yaw"] - f.calib("yaw", 0.0)) < T.EYE_YAW_TOL_DEG)
            & (np.abs(f["pitch"] - f.calib("pitch", 0.0)) < T.EYE_PITCH_TOL_DEG)
            & (np.abs(f["gaze_h"] - f.calib("gaze_h", 0.0)) < T.EYE_GAZE_H_TOL)
            & (np.abs(f["gaze_v"] - f.calib("gaze_v", 0.0)) < T.EYE_GAZE_V_TOL)
        )
    return _where_valid(valid, contact)


def expression_activity(f: Frames) -> np.ndarray:
    """How much the face moves: summed rolling std of smile, brow and cheek blendshapes."""
    total = np.zeros(len(f))
    for key in ("smile", "brow", "cheek"):
        std = rolling(f.t, f[key], T.EXPR_WINDOW_S, np.std)
        total += np.nan_to_num(std, nan=0.0)
    total[f["face"] < 0.5] = np.nan
    return total


def flat_face(f: Frames) -> np.ndarray:
    activity = expression_activity(f)
    valid = np.isfinite(activity)
    with np.errstate(invalid="ignore"):
        smiling = np.nan_to_num(f["smile"], nan=0.0) >= T.EXPR_FLAT_SMILE
        flat = (activity < T.EXPR_FLAT_ACTIVITY) & ~smiling
    return _where_valid(valid, flat)


def head_speed(f: Frames) -> np.ndarray:
    """Angular speed of the head in degrees per second, smoothed."""
    n = len(f)
    speed = np.full(n, np.nan)
    if n < 2:
        return speed
    dt = np.diff(f.t)
    dt[dt <= 0] = np.nan
    # Smooth the angles first so landmark jitter doesn't read as movement.
    yaw, pitch, roll = (rolling(f.t, f[k], 0.5, np.mean) for k in ("yaw", "pitch", "roll"))
    delta = np.sqrt(np.diff(yaw) ** 2 + np.diff(pitch) ** 2 + np.diff(roll) ** 2)
    speed[1:] = delta / dt
    return rolling(f.t, speed, T.HEAD_SPEED_WINDOW_S, np.mean)


def restless_head(f: Frames) -> np.ndarray:
    speed = head_speed(f)
    valid = np.isfinite(speed)
    with np.errstate(invalid="ignore"):
        return _where_valid(valid, speed > T.HEAD_SPEED_MAX_DEG_S)


def slouching(f: Frames) -> np.ndarray:
    neck = f["neck"]
    baseline = f.calib("neck", np.nan)
    valid = np.isfinite(neck) & np.isfinite(baseline) & (f["pose"] >= 0.5)
    with np.errstate(invalid="ignore"):
        return _where_valid(valid, neck < baseline * T.SLOUCH_NECK_RATIO)


def leaning(f: Frames) -> np.ndarray:
    tilt = f["tilt"]
    valid = np.isfinite(tilt) & (f["pose"] >= 0.5)
    with np.errstate(invalid="ignore"):
        return _where_valid(valid, np.abs(tilt - f.calib("tilt", 0.0)) > T.LEAN_TILT_DEG)


def fidget_level(f: Frames) -> np.ndarray:
    return rolling(f.t, f["motion"], T.FIDGET_WINDOW_S, np.mean)


def fidgeting(f: Frames) -> np.ndarray:
    level = fidget_level(f)
    valid = np.isfinite(level)
    with np.errstate(invalid="ignore"):
        return _where_valid(valid, level > T.FIDGET_MOTION_MAX)


def framing_issue(f: Frames) -> dict[str, np.ndarray]:
    """One 1/0 array per framing problem. Missing face is itself a problem here."""
    n = len(f)
    face = f["face"] >= 0.5
    w, cx, cy, light = f["face_w"], f["face_cx"], f["face_cy"], f["light"]
    has_box = face & np.isfinite(w) & np.isfinite(cx) & np.isfinite(cy)
    with np.errstate(invalid="ignore"):
        issues = {
            "no_face": np.where(face, 0.0, 1.0),
            "too_far": _where_valid(has_box, w < T.FRAME_FACE_W_MIN),
            "too_close": _where_valid(has_box, w > T.FRAME_FACE_W_MAX),
            "off_center": _where_valid(
                has_box,
                (np.abs(cx - 0.5) > T.FRAME_CENTER_X_TOL) | (np.abs(cy - 0.5) > T.FRAME_CENTER_Y_TOL),
            ),
            "too_dark": _where_valid(np.isfinite(light), light < T.FRAME_LIGHT_MIN),
        }
    if n == 0:
        return {k: np.array([]) for k in issues}
    return issues
