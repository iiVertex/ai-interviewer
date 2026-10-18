"""Turning the browser's per-frame signal payload into numpy arrays, plus run helpers."""

from dataclasses import dataclass

import numpy as np

FRAME_KEYS = (
    "t", "face", "yaw", "pitch", "roll", "gaze_h", "gaze_v", "blink",
    "smile", "brow", "cheek", "mouth", "face_cx", "face_cy", "face_w", "light",
    "pose", "neck", "tilt", "motion", "level",
)
CALIBRATION_KEYS = ("yaw", "pitch", "gaze_h", "gaze_v", "neck", "tilt", "face_w")


@dataclass
class Frames:
    t: np.ndarray
    cols: dict[str, np.ndarray]
    calibration: dict[str, float]
    duration_s: float

    def __getitem__(self, key: str) -> np.ndarray:
        return self.cols[key]

    def __len__(self) -> int:
        return len(self.t)

    def calib(self, key: str, default: float) -> float:
        v = self.calibration.get(key)
        return default if v is None or not np.isfinite(v) else float(v)


def load_frames(payload: dict) -> Frames:
    raw = payload.get("frames") or {}
    t = np.asarray(raw.get("t") or [], dtype=float)
    n = len(t)
    cols: dict[str, np.ndarray] = {}
    for key in FRAME_KEYS:
        if key == "t":
            continue
        values = raw.get(key)
        if values is None or len(values) != n:
            cols[key] = np.full(n, np.nan)
        else:
            cols[key] = np.array([np.nan if v is None else v for v in values], dtype=float)
    calibration = {k: v for k, v in (payload.get("calibration") or {}).items() if k in CALIBRATION_KEYS}
    duration = float(payload.get("duration_s") or (t[-1] if n else 0.0))
    return Frames(t=t, cols=cols, calibration=calibration, duration_s=duration)


def rolling(t: np.ndarray, values: np.ndarray, window_s: float, fn) -> np.ndarray:
    """Apply `fn` to the finite values in a centered time window around each frame."""
    out = np.full(len(t), np.nan)
    half = window_s / 2
    lo = np.searchsorted(t, t - half, side="left")
    hi = np.searchsorted(t, t + half, side="right")
    for i in range(len(t)):
        chunk = values[lo[i]:hi[i]]
        chunk = chunk[np.isfinite(chunk)]
        if len(chunk):
            out[i] = fn(chunk)
    return out


def find_runs(t: np.ndarray, bad: np.ndarray, min_s: float, merge_gap_s: float) -> list[tuple[int, int]]:
    """Index ranges [start, end] where `bad` is true for at least `min_s` seconds.

    `bad` is 1/0 per frame, or NaN where the frame says nothing (e.g. no face).
    Bad stretches separated by less than `merge_gap_s` of good frames are joined.
    """
    runs: list[tuple[int, int]] = []
    start = last_bad = None
    for i in range(len(t)):
        v = bad[i]
        if not np.isfinite(v):
            continue
        if v >= 0.5:
            if start is None:
                start = i
            last_bad = i
        elif start is not None and t[i] - t[last_bad] > merge_gap_s:
            runs.append((start, last_bad))
            start = last_bad = None
    if start is not None:
        runs.append((start, last_bad))
    return [(s, e) for s, e in runs if t[e] - t[s] >= min_s]


def fraction(values: np.ndarray) -> float | None:
    finite = values[np.isfinite(values)]
    return float(finite.mean()) if len(finite) else None


def per_second(t: np.ndarray, values: np.ndarray, duration_s: float) -> list[float | None]:
    """Mean of `values` in each whole second, for compact timeline charts."""
    seconds = int(np.ceil(duration_s)) if duration_s > 0 else 0
    out: list[float | None] = []
    for s in range(seconds):
        mask = (t >= s) & (t < s + 1) & np.isfinite(values)
        out.append(round(float(values[mask].mean()), 3) if mask.any() else None)
    return out
