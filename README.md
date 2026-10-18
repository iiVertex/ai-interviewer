# Interview Coach

Practice interviews with an AI interviewer. Computer vision runs in the browser while you answer; afterwards you get a report with scores, a timeline of flagged moments, screenshots of the moments to fix, and feedback on what you said.

- **Modes:** job interview (role, seniority, optional job description), student (internship / college / scholarship), communication practice
- **Session:** setup check, 3-second gaze calibration, 5 spoken questions, about 10 s of thinking time, up to 2 min per answer
- **Signals:** eye contact, facial expressiveness, head stability, posture, fidgeting, framing, plus speaking pace, filler words and pauses
- **Privacy:** raw video never leaves the browser. The server stores transcripts, scores, the measured signal numbers and flag screenshots.

## How it fits together

```
web/ (React + Vite + TS)                       server/ (FastAPI, deployed as one Vercel function)
 ├ vision/engine.ts   MediaPipe face + pose     ├ main.py            routes (see the flow below)
 ├ vision/capture.ts  10 fps signal recording   ├ analysis/          rule-based flags + scores (no AI)
 ├ audio/             mic level, interviewer    │   └ thresholds.py  every tunable number
 ├ pages/Interview    the interview room        ├ ai.py              CometAPI: Whisper + TTS (OpenAI SDK), Claude (Anthropic SDK)
 └ pages/Report       the report                ├ content.py         the one Claude scoring call per session
                                                └ questions.py       placeholder question bank
supabase/migrations/   tables, row-level security, storage buckets
```

After the last answer the browser drives the pipeline:

1. `POST /api/sessions/{id}/answers/{i}`: audio and signals for each answer (uploaded as soon as the answer ends). The server transcribes the audio with `whisper-1` and analyzes the answer.
2. `POST /api/sessions/{id}/analyze`: picks at most 8 flags and 2 highlights and computes the scores.
3. The browser uploads screenshots for the flags that need one, taken from thumbnails it kept in memory. At the same time it calls `POST /api/sessions/{id}/score`, which makes one `claude-sonnet-5-5` call for content feedback.

AI cost per session is roughly 5 to 10 cents (Whisper plus one Sonnet call; question audio is cached in storage, so each question is voiced only once).

## Setup

### 1. Supabase
1. Create a project at [supabase.com](https://supabase.com).
2. In **SQL Editor**, run the files in [`supabase/migrations/`](supabase/migrations/) in order. They create the tables, security policies and the `screenshots`, `signals` and `tts` buckets.
3. Sign-in is email and password. In **Authentication → Sign In / Providers → Email**, turn off **Confirm email** for now. Supabase's built-in mailer only sends to your project's team members and only a few emails an hour, so other people would never receive the confirmation link. Turn it back on once you set up custom SMTP.
4. In **Authentication → URL Configuration**, set the Site URL to your deployed URL, and add `http://localhost:5173` to the redirect URLs (used by confirmation links).

### 2. Environment files
```bash
cp .env.example .env               # server: Supabase service key + CometAPI key
cp web/.env.example web/.env.local # browser: Supabase URL + anon key
```

### 3. Run locally
```bash
# backend (from the repo root)
python -m venv .venv
.venv/Scripts/activate            # Windows; on macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt pytest uvicorn
uvicorn server.main:app --reload --port 8000

# frontend (second terminal)
cd web
npm install
npm run dev                        # http://localhost:5173 (proxies /api to :8000)
```

### 4. Check CometAPI first (do this on day 1)
```bash
python -m server.tools.check_comet
```
It checks text-to-speech, Whisper word timestamps (and whether filler words survive) and Claude structured output through CometAPI. If word timestamps aren't returned, the pipeline falls back to estimated timings.

## Tests and tuning
```bash
python -m pytest                       # analysis rules + full API flow against an in-memory Supabase
python -m server.tools.replay SESSION  # re-run the analysis on a recorded session
```
The flag thresholds are temporary starting values. Record some sessions, change `server/analysis/thresholds.py`, and replay a session to see how the flags change without recording again. The flag messages and fix tips are in `server/analysis/tips.py`.

## Deploy (Vercel, free Hobby plan)
1. Import the repo into Vercel. `vercel.json` builds `web/`, and `pyproject.toml` points Vercel at `server.main:app`.
2. Add the variables from `.env.example` in the Vercel project settings. Vite reads `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` at build time.
3. Add the Vercel URL to Supabase's Site URL and redirect URLs.

Notes:
- The Hobby plan is for non-commercial use. Switch to Pro if you start charging.
- Vercel caps request bodies at 4.5 MB, which is why each answer is uploaded separately.

## Switches
- `ENABLE_JD_QUESTIONS=true`: generates tailored job-interview questions with `claude-haiku-5-5` when a role or job description is given (off for now; the placeholder bank is used).
- `DEFAULT_DAILY_LIMIT`: sessions per account per 24 hours (default 5). Raise it per person in the `profiles.daily_session_limit` column.
