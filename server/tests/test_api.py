"""End-to-end run of the API routes against an in-memory stand-in for Supabase and the AI calls."""

import json
import uuid
from datetime import datetime, timezone

import pytest
from fastapi.testclient import TestClient

from server import main
from server.deps import User, current_user, get_db
from server.tests.test_analysis import make_signals, make_words

USER = User(id="user-1", email="a@example.com")


class Result:
    def __init__(self, data, count=None):
        self.data, self.count = data, count


class Query:
    def __init__(self, db, table):
        self.db, self.table, self.filters, self.op, self.payload = db, table, [], "select", None
        self.count = None
        self._limit = None
        self._order = None

    def select(self, *_cols, count=None):
        self.count = count
        return self

    def insert(self, row):
        self.op, self.payload = "insert", row
        return self

    def upsert(self, row):
        self.op, self.payload = "upsert", row
        return self

    def update(self, row):
        self.op, self.payload = "update", row
        return self

    def delete(self):
        self.op = "delete"
        return self

    def eq(self, col, value):
        self.filters.append(lambda r: r.get(col) == value)
        return self

    def gte(self, col, value):
        self.filters.append(lambda r: str(r.get(col)) >= value)
        return self

    def limit(self, n):
        self._limit = n
        return self

    def order(self, col):
        self._order = col
        return self

    def execute(self):
        rows = self.db.tables.setdefault(self.table, [])
        keys = {"sessions": ("id",), "profiles": ("id",), "session_answers": ("session_id", "idx")}[self.table]
        match = [r for r in rows if all(f(r) for f in self.filters)]
        if self.op == "select":
            if self._order:
                match.sort(key=lambda r: r[self._order])
            out = match[: self._limit] if self._limit else match
            return Result([dict(r) for r in out], count=len(match) if self.count else None)
        if self.op == "insert":
            row = {"id": str(uuid.uuid4()), "created_at": datetime.now(timezone.utc).isoformat(),
                   "flags": [], "scores": None, "content": None, "error": None, **self.payload}
            rows.append(row)
            return Result([dict(row)])
        if self.op == "upsert":
            existing = [r for r in rows if all(r.get(k) == self.payload.get(k) for k in keys)]
            if existing:
                existing[0].update(self.payload)
                return Result([dict(existing[0])])
            rows.append(dict(self.payload))
            return Result([dict(self.payload)])
        if self.op == "update":
            for r in match:
                r.update(self.payload)
            return Result([dict(r) for r in match])
        if self.op == "delete":
            self.db.tables[self.table] = [r for r in rows if r not in match]
            return Result([dict(r) for r in match])
        raise AssertionError(self.op)


class Bucket:
    def __init__(self, db, name):
        self.db, self.name = db, name

    def upload(self, path, data, options=None):
        self.db.files[(self.name, path)] = data

    def list(self, folder):
        return [{"name": p.split("/")[-1]} for (b, p) in self.db.files if b == self.name and p.startswith(folder + "/")]

    def remove(self, paths):
        for p in paths:
            self.db.files.pop((self.name, p), None)

    def get_public_url(self, path):
        return f"https://storage.example/{self.name}/{path}"


class Storage:
    def __init__(self, db):
        self.db = db

    def from_(self, name):
        return Bucket(self.db, name)


class FakeDB:
    def __init__(self):
        self.tables: dict[str, list[dict]] = {}
        self.files: dict[tuple[str, str], bytes] = {}
        self.storage = Storage(self)

    def table(self, name):
        return Query(self, name)


@pytest.fixture
def env(monkeypatch):
    db = FakeDB()
    main.app.dependency_overrides[get_db] = lambda: db
    main.app.dependency_overrides[current_user] = lambda: USER
    monkeypatch.setattr(main.ai, "transcribe", lambda audio, name, mime: {
        "text": "a test answer", "words": make_words(), "word_timestamps": True})
    monkeypatch.setattr(main.ai, "synthesize", lambda text: b"ID3fake-mp3")
    monkeypatch.setattr(main.httpx, "head", lambda *a, **k: type("Head", (), {"status_code": 404})())
    calls = []

    def fake_score(mode, config, answers, flags):
        calls.append((mode, config, [a["idx"] for a in answers], len(flags)))
        return {
            "answers": [{"index": a["idx"], "score": 70 + a["idx"], "rubric": [], "worked": ["x"], "missing": ["y"],
                         "stronger_answer": "z"} for a in answers],
            "summary": "Good session.",
            "top_fixes": [{"title": "Look at the camera", "detail": "..."}],
        }

    monkeypatch.setattr(main, "score_content", fake_score)
    yield TestClient(main.app), db, calls
    main.app.dependency_overrides.clear()


def test_full_session_flow(env):
    client, db, calls = env

    assert client.get("/api/me").json()["consented"] is False
    assert client.post("/api/sessions", json={"mode": "job"}).status_code == 403
    client.post("/api/consent")

    res = client.post("/api/sessions", json={"mode": "job", "config": {"role": "Analyst", "seniority": "junior"}})
    assert res.status_code == 200, res.text
    sid, questions = res.json()["id"], res.json()["questions"]
    assert len(questions) == 5 and "Analyst" in questions[0]["text"]

    audio = client.post(f"/api/sessions/{sid}/questions/0/audio").json()
    assert audio["url"].endswith(".mp3") and ("tts", audio["url"].split("/tts/")[1]) in db.files

    for idx in (0, 1):
        res = client.post(
            f"/api/sessions/{sid}/answers/{idx}",
            files={
                "audio": ("answer.webm", b"x" * 5000, "audio/webm;codecs=opus"),
                "signals": ("signals.json", json.dumps(make_signals()), "application/json"),
            },
        )
        assert res.status_code == 200, res.text
    assert ("signals", f"user-1/{sid}/answer-1.json") in db.files

    analyzed = client.post(f"/api/sessions/{sid}/analyze").json()
    flags = analyzed["flags"]
    assert 0 < len([f for f in flags if f["kind"] == "issue"]) <= 8
    assert analyzed["scores"]["content"] is None and analyzed["scores"]["overall"] is not None

    scored = client.post(f"/api/sessions/{sid}/score").json()
    assert scored == {"ok": True, "content_error": None}
    assert calls[0][0] == "job" and calls[0][2] == [0, 1]

    session = db.tables["sessions"][0]
    assert session["status"] == "ready" and session["scores"]["content"] == 70  # duration-weighted 70/71
    assert {a["scores"]["content"] for a in db.tables["session_answers"]} == {70, 71}

    assert client.delete(f"/api/sessions/{sid}").json() == {"ok": True}
    assert db.tables["sessions"] == []
    assert not [k for k in db.files if k[0] == "signals"]


def test_daily_limit(env):
    client, db, _ = env
    client.post("/api/consent")
    db.tables["profiles"][0]["daily_session_limit"] = 2
    assert client.post("/api/sessions", json={"mode": "communication"}).status_code == 200
    assert client.post("/api/sessions", json={"mode": "communication"}).status_code == 200
    res = client.post("/api/sessions", json={"mode": "communication"})
    assert res.status_code == 429 and "limit of 2" in res.json()["detail"]


def test_scoring_failure_still_finishes(env, monkeypatch):
    client, db, _ = env
    client.post("/api/consent")
    sid = client.post("/api/sessions", json={"mode": "student", "config": {"student_type": "college"}}).json()["id"]
    client.post(f"/api/sessions/{sid}/answers/0", files={
        "audio": ("a.webm", b"", "audio/webm"),
        "signals": ("s.json", json.dumps(make_signals()), "application/json"),
    })
    client.post(f"/api/sessions/{sid}/analyze")

    def boom(*_a):
        raise RuntimeError("proxy down")

    monkeypatch.setattr(main, "score_content", boom)
    res = client.post(f"/api/sessions/{sid}/score").json()
    assert res["content_error"] == "proxy down"
    assert db.tables["sessions"][0]["status"] == "ready"
