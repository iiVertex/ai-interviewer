"""Every tunable number in the analysis lives here.

These are the temporary starting values agreed for the MVP. Tune them by recording
sessions and re-running `python -m server.tools.replay` on the saved signal files.
"""

# --- Eye contact -----------------------------------------------------------
# A frame counts as eye contact when head angle and gaze stay close to the
# calibration baseline (the user looking at the dot next to the camera).
EYE_YAW_TOL_DEG = 15.0
EYE_PITCH_TOL_DEG = 13.0
EYE_GAZE_H_TOL = 0.30  # blendshape gaze units, roughly -1..1
EYE_GAZE_V_TOL = 0.30
EYE_BLINK_MAX = 0.55  # frames with eyes mostly closed are ignored
EYE_FLAG_MIN_S = 4.0  # flag when contact stays below EYE_FLAG_MAX_FRACTION this long
EYE_FLAG_MAX_FRACTION = 0.5

# --- Facial expressiveness -------------------------------------------------
EXPR_WINDOW_S = 3.0  # rolling window for measuring facial movement
EXPR_FLAT_ACTIVITY = 0.025  # summed std of smile/brow/cheek below this = flat
EXPR_FLAT_SMILE = 0.15  # ...unless the user is visibly smiling
EXPR_FLAG_MIN_S = 15.0

# --- Head stability --------------------------------------------------------
HEAD_SPEED_WINDOW_S = 2.0
HEAD_SPEED_MAX_DEG_S = 35.0  # sustained angular speed above this = restless head
HEAD_FLAG_MIN_S = 4.0

# --- Posture ---------------------------------------------------------------
SLOUCH_NECK_RATIO = 0.82  # neck height below 82% of calibration = slouching
LEAN_TILT_DEG = 8.0  # shoulder tilt this far from calibration = leaning
POSTURE_FLAG_MIN_S = 5.0

# --- Fidgeting -------------------------------------------------------------
FIDGET_WINDOW_S = 2.0
FIDGET_MOTION_MAX = 0.35  # shoulder-widths per second of upper-body movement
FIDGET_FLAG_MIN_S = 4.0

# --- Framing ---------------------------------------------------------------
FRAME_FACE_W_MIN = 0.12  # face narrower than this share of the frame = too far
FRAME_FACE_W_MAX = 0.50  # wider = too close
FRAME_CENTER_X_TOL = 0.25
FRAME_CENTER_Y_TOL = 0.30
FRAME_LIGHT_MIN = 0.22  # mean frame brightness 0..1
FRAME_FLAG_MIN_S = 3.0

# --- Speech ----------------------------------------------------------------
PACE_WINDOW_S = 10.0
PACE_FAST_WPM = 180.0
PACE_SLOW_WPM = 100.0
PACE_IDEAL = (110.0, 170.0)  # used for scoring
FILLER_WINDOW_S = 10.0
FILLER_FLAG_COUNT = 3
PAUSE_FLAG_S = 3.0
SPEECH_LEVEL_MIN = 0.012  # absolute floor for "someone is talking" (RMS)
SPEECH_LEVEL_FLOOR_MULT = 3.0  # or this many times the room's noise floor

# --- Report ----------------------------------------------------------------
MAX_ISSUE_FLAGS = 8
MAX_FLAGS_PER_SIGNAL = 3
HIGHLIGHT_COUNT = 2
HIGHLIGHT_WINDOW_S = 10.0
MERGE_GAP_S = 1.0  # bad stretches closer than this are treated as one
