# Kemo AI

**Practice interviews out loud with an AI interviewer, then see exactly what to fix.**

Kemo AI asks you real interview questions by voice while your webcam and mic are analyzed in the browser. When you finish, you get a report with scores, a timeline of the moments that went wrong (or right), a screenshot of each one, and a concrete tip to fix it.

**Live demo:** https://kemoai.vercel.app/

## Why

Most people prepare for interviews by reading answers in their head. Then the real interview goes badly because of things they never practiced: looking away, saying "um" constantly, rushing, slouching, or rambling without a clear example. Kemo AI lets you rehearse the way it actually happens and shows you those habits with timestamps and screenshots.

## What it does

- **Three practice modes:** job interview (role, seniority, optional job description), student interview (internship, college, scholarship) and general communication practice.
- **A spoken interview:** a quick camera check and 3-second gaze calibration, then 5 questions read aloud. You get about 10 seconds to think and up to 2 minutes per answer.
- **Body language, measured live:** eye contact, facial expressiveness, head stability, posture, fidgeting and framing.
- **Delivery, from your transcript:** speaking pace, filler words and long pauses.
- **Answer feedback:** structure, relevance and use of examples, plus a stronger version of your answer.
- **A report you can come back to:** scores for eye contact, expressiveness, composure, delivery and content; flagged moments on a timeline; replays of each answer.
- **Practice bank:** save questions from a report and start a new session from them later.

## Privacy

- Face and posture analysis runs **on your device** (MediaPipe in the browser). **No AI ever sees your video.**
- Only your answer transcripts are sent to the AI for feedback.
- Answer recordings are stored in a private bucket that only you can access, so you can replay them.
- Deleting a session deletes its recordings, transcripts, scores and screenshots.

## How it works

1. **In the browser**, MediaPipe tracks your face and pose at 10 fps while you answer. Each answer's audio and signal data are uploaded as soon as it ends.
2. **The server** transcribes the audio with Whisper (with word timestamps, so fillers and pauses can be placed on the timeline).
3. **Rule-based analysis** (plain Python, no AI) turns the signals into flags and scores. It keeps the 8 most important flags and 2 highlights.
4. **One Claude call per session** reviews the transcripts and writes the content feedback.

We kept AI use small on purpose: one Whisper call per answer and one Claude Haiku call per session. Question audio is generated once and cached, so it's reused across sessions.

## Tech stack

| Part | Tech |
| --- | --- |
| Frontend | React, TypeScript, Vite, MediaPipe (face + pose) |
| Backend | Python, FastAPI (runs as one Vercel serverless function) |
| Database, auth, storage | Supabase (Postgres with row-level security, email sign-in, private storage buckets) |
| AI (via CometAPI) | `whisper-1` speech-to-text, `gpt-4o-mini-tts` interviewer voice, `claude-haiku-5-5` feedback |
| Hosting | Vercel (free Hobby plan) |

```
web/                  React app
  src/vision/         MediaPipe face + pose tracking, signal capture
  src/audio/          mic level, interviewer voice
  src/pages/          landing, setup, interview room, report, practice bank
server/               FastAPI app
  main.py             API routes
  analysis/           rule-based flags and scores (thresholds.py holds every tunable number)
  ai.py, content.py   Whisper, TTS and the Claude feedback call
supabase/migrations/  tables, security policies, storage buckets
```

## Run it locally

You need Python 3.12+, Node 20.19+, a [Supabase](https://supabase.com) project and a [CometAPI](https://www.cometapi.com) key.

**1. Set up Supabase**
- In the **SQL Editor**, run the files in [`supabase/migrations/`](supabase/migrations/) in order.
- In **Authentication → Sign In / Providers → Email**, turn off **Confirm email** (Supabase's built-in mailer only sends to your own team).
- In **Authentication → URL Configuration**, add `http://localhost:5173` to the redirect URLs.

**2. Add your keys**
```bash
cp .env.example .env                # Supabase service key + CometAPI key
cp web/.env.example web/.env.local  # Supabase URL + anon key
```

**3. Start the backend and frontend**
```bash
# backend, from the repo root
python -m venv .venv
source .venv/bin/activate           # Windows: .venv\Scripts\activate
pip install -r requirements.txt pytest "uvicorn[standard]"
uvicorn server.main:app --reload --port 8000

# frontend, in a second terminal
cd web
npm install
npm run dev                         # open http://localhost:5173
```

Optional: `python -m server.tools.check_comet` checks that your CometAPI key works for TTS, Whisper and Claude.

## Deploy

1. Import the repo into Vercel. `vercel.json` builds the frontend and `pyproject.toml` points Vercel at the FastAPI app.
2. Add the variables from `.env.example` and `web/.env.example` in the Vercel project settings.
3. Add your Vercel URL to Supabase's Site URL and redirect URLs.

## Tests and tuning

```bash
python -m pytest                        # analysis rules + the full API flow
python -m server.tools.replay SESSION   # re-run the analysis on a recorded session
```

Flag thresholds live in `server/analysis/thresholds.py` and the flag messages and tips in `server/analysis/tips.py`. Change a threshold and replay a session to see the effect without recording again.

## Settings

| Variable | What it does |
| --- | --- |
| `DEFAULT_DAILY_LIMIT` | Sessions per account per 24 hours (default 5). Can be raised per user in `profiles.daily_session_limit`. |
| `ENABLE_JD_QUESTIONS` | Generates questions tailored to the role and job description with Claude (off by default; uses the built-in question bank). |
| `CONTENT_MODEL` | The feedback model (default `claude-haiku-5-5`; `claude-sonnet-5-5` for higher quality at higher cost). |
