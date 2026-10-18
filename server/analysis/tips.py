"""Pre-written wording for flags: a short label, a message template and one concrete fix.

Placeholder copy for the MVP; the team can rewrite it freely without touching the logic.
"""

# category groups signals for the timeline colours and the five report scores
SIGNALS = {
    "eye_contact": {
        "category": "eye_contact",
        "label": "Eye contact",
        "message": "Eye contact dropped to {pct}% for {dur}s.",
        "tip": "Put a small sticky note right next to your camera and talk to it, as if it were the interviewer's face.",
    },
    "flat_face": {
        "category": "expressiveness",
        "label": "Flat expression",
        "message": "Your expression stayed flat for {dur}s.",
        "tip": "Let your face follow your words: smile when you introduce yourself and raise your brows on key points.",
    },
    "restless_head": {
        "category": "composure",
        "label": "Head movement",
        "message": "A lot of head movement for {dur}s.",
        "tip": "Keep your head mostly still and let small nods land on the points you want to stress.",
    },
    "slouching": {
        "category": "composure",
        "label": "Slouching",
        "message": "You slouched for {dur}s.",
        "tip": "Sit back in your chair with both feet on the floor; imagine a string pulling the top of your head up.",
    },
    "leaning": {
        "category": "composure",
        "label": "Leaning",
        "message": "You leaned to one side for {dur}s.",
        "tip": "Square your shoulders to the camera and rest both forearms evenly on the desk.",
    },
    "fidgeting": {
        "category": "composure",
        "label": "Fidgeting",
        "message": "Restless movement for {dur}s.",
        "tip": "Rest your hands loosely together on the desk between gestures, and keep anything you might fiddle with out of reach.",
    },
    "no_face": {
        "category": "framing",
        "label": "Out of frame",
        "message": "Your face left the frame for {dur}s.",
        "tip": "Center yourself before you start and keep your head inside the frame, especially when you think.",
    },
    "too_far": {
        "category": "framing",
        "label": "Too far away",
        "message": "You were far from the camera for {dur}s.",
        "tip": "Sit close enough that your head and shoulders fill most of the frame.",
    },
    "too_close": {
        "category": "framing",
        "label": "Too close",
        "message": "You were very close to the camera for {dur}s.",
        "tip": "Sit back about an arm's length so your shoulders are visible.",
    },
    "off_center": {
        "category": "framing",
        "label": "Off-center",
        "message": "You drifted off-center for {dur}s.",
        "tip": "Line your eyes up with the top third of the frame and keep your body centered.",
    },
    "too_dark": {
        "category": "framing",
        "label": "Lighting",
        "message": "The lighting was too dark for {dur}s.",
        "tip": "Face a window or put a lamp behind your screen so light falls on your face, not behind you.",
    },
    "pace_fast": {
        "category": "delivery",
        "label": "Speaking fast",
        "message": "You spoke fast (about {wpm} words/min) for {dur}s.",
        "tip": "Pause for a beat after each key point. Aim for roughly 130 to 160 words per minute.",
    },
    "pace_slow": {
        "category": "delivery",
        "label": "Speaking slowly",
        "message": "You spoke slowly (about {wpm} words/min) for {dur}s.",
        "tip": "Decide your main point before you start talking so the words come more steadily.",
    },
    "fillers": {
        "category": "delivery",
        "label": "Filler words",
        "message": "{count} filler words in {dur}s ({words}).",
        "tip": "When you feel an \"um\" coming, close your mouth and pause instead. A silent pause sounds confident.",
    },
    "pause": {
        "category": "delivery",
        "label": "Long pause",
        "message": "A {dur}s silence in the middle of your answer.",
        "tip": "If you need time, say so (\"Let me think about that for a second\") rather than going silent.",
    },
}

HIGHLIGHT_TIP = "This is what you're aiming for. Notice how it felt and repeat it."
