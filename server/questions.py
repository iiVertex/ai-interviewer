"""Placeholder question bank. Questions are picked at random per session.

`{role}` is filled with the job title the user typed (or "this role").
Student questions are tagged with the interview types they suit; untagged ones suit all.
"""

import random
import re

JOB = [
    ("job-01", "Tell me about yourself and why you're interested in {role}."),
    ("job-02", "Describe a time you faced a difficult problem at work or school. How did you solve it?"),
    ("job-03", "Tell me about a time you disagreed with a teammate. What happened and what did you do?"),
    ("job-04", "What's an accomplishment you're proud of, and what was your specific contribution?"),
    ("job-05", "Tell me about a time you failed or made a mistake. What did you learn?"),
    ("job-06", "Describe a situation where you had to deliver under a tight deadline."),
    ("job-07", "Why do you want to work in {role}, and what makes you a strong fit?"),
    ("job-08", "Tell me about a time you had to learn something new quickly."),
    ("job-09", "Describe a time you took the lead on something without being asked."),
    ("job-10", "Where do you see yourself in the next three to five years?"),
]

STUDENT = [
    ("stu-01", "Tell me a little about yourself and what you're studying.", ()),
    ("stu-02", "Describe a project you worked on that you're proud of. What was your role?", ()),
    ("stu-03", "Tell me about a challenge you faced in school and how you handled it.", ()),
    ("stu-04", "How do you balance your studies with your other commitments?", ()),
    ("stu-05", "Why are you interested in this internship, and what do you hope to learn?", ("internship",)),
    ("stu-06", "Tell me about a time you worked in a team. What did you contribute?", ("internship",)),
    ("stu-07", "Why do you want to attend this college, and what will you bring to the community?", ("college",)),
    ("stu-08", "What's a subject or idea that excites you outside the classroom?", ("college",)),
    ("stu-09", "Why do you deserve this scholarship, and how will it help your goals?", ("scholarship",)),
    ("stu-10", "Tell me about a way you've made a difference in your community.", ("scholarship",)),
]

COMMUNICATION = [
    ("com-01", "Explain a topic you know well to someone who has never heard of it."),
    ("com-02", "Describe your ideal weekend, and convince me it's the best way to spend one."),
    ("com-03", "Argue for an opinion you hold that most people disagree with."),
    ("com-04", "Tell me a story about a moment that changed how you think."),
    ("com-05", "What's a skill everyone should learn, and why?"),
    ("com-06", "Describe a place you love so vividly that I can picture it."),
    ("com-07", "Explain how you'd solve a problem in your city or neighborhood."),
    ("com-08", "Tell me about a book, film or show that stuck with you, and why."),
    ("com-09", "Give a one-minute pitch for an idea, product or cause you care about."),
    ("com-10", "What's the best advice you've ever received, and how have you used it?"),
]

STUDENT_TYPES = {"internship", "college", "scholarship"}
SENIORITIES = {"intern", "junior", "mid", "senior"}


def _clean_role(role: str | None) -> str:
    role = re.sub(r"\s+", " ", (role or "").strip())[:80]
    return f"the {role} role" if role else "this role"


def pick_questions(mode: str, config: dict, count: int = 5, rng: random.Random | None = None) -> list[dict]:
    rng = rng or random.Random()
    if mode == "job":
        role = _clean_role(config.get("role"))
        pool = [(qid, text.replace("{role}", role)) for qid, text in JOB]
        # Always open with the introduction question, like a real interview.
        first, rest = pool[0], pool[1:]
        chosen = [first] + rng.sample(rest, count - 1)
    elif mode == "student":
        kind = config.get("student_type")
        specific = [(qid, t) for qid, t, tags in STUDENT if kind in tags]
        general = [(qid, t) for qid, t, tags in STUDENT if not tags]
        other = [(qid, t) for qid, t, tags in STUDENT if tags and kind not in tags]
        first, general = general[0], general[1:]
        # Prefer questions for the chosen interview type, then general, then the rest.
        rest = specific + rng.sample(general, len(general)) + rng.sample(other, len(other))
        chosen = [first] + rest[: count - 1]
    elif mode == "communication":
        chosen = rng.sample(COMMUNICATION, count)
    else:
        raise ValueError(f"unknown mode {mode!r}")
    return [{"id": qid, "text": text} for qid, text in chosen]
