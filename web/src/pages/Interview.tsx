import { useCallback, useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { LevelMeter } from '../audio/level'
import { speak, type Speech } from '../audio/voice'
import { toWav } from '../audio/wav'
import { BrandMark } from '../components/BrandMark'
import { VoiceWave, type WaveState } from '../components/VoiceWave'
import { api } from '../lib/api'
import { formatTime } from '../lib/format'
import { useAuth } from '../lib/auth'
import { nearestThumbnail, saveRecording } from '../lib/recordings'
import { supabase } from '../lib/supabase'
import type { Question } from '../lib/types'
import { CaptureLoop, SignalRecorder, calibrate, type Calibration, type SignalPayload, type Tick } from '../vision/capture'
import { VisionEngine } from '../vision/engine'

const THINK_SECONDS = 10
const ANSWER_SECONDS = 120
const CALIBRATION_MS = 3000

type Phase = 'loading' | 'setup' | 'calibrating' | 'interview' | 'processing' | 'error'
type Stage = 'speaking' | 'thinking' | 'answering' | 'saving'
type Checks = { face: boolean; centered: boolean; distance: 'ok' | 'far' | 'close' | null; light: boolean; mic: boolean }
type StepState = 'pending' | 'active' | 'done' | 'failed'

const STEPS = [
  ['upload', 'Uploading your answers'],
  ['analyze', 'Finding your key moments'],
  ['screens', 'Saving screenshots'],
  ['video', 'Saving your replays'],
  ['score', 'Reviewing what you said'],
] as const
type StepKey = (typeof STEPS)[number][0]

type PendingUpload = { audio: Blob; payload: SignalPayload; promise: Promise<unknown> | null; done: boolean }

function pickMime(candidates: string[]): string | undefined {
  return candidates.find((m) => MediaRecorder.isTypeSupported(m))
}

function startRecorder(stream: MediaStream, mimeType: string | undefined, bits: { audio?: number; video?: number }) {
  const recorder = new MediaRecorder(stream, {
    mimeType,
    audioBitsPerSecond: bits.audio,
    videoBitsPerSecond: bits.video,
  })
  const chunks: Blob[] = []
  recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data)
  recorder.start(1000)
  return {
    stop: () =>
      new Promise<Blob>((resolve) => {
        recorder.onstop = () => resolve(new Blob(chunks, { type: recorder.mimeType || mimeType }))
        if (recorder.state !== 'inactive') recorder.stop()
        else resolve(new Blob(chunks, { type: recorder.mimeType || mimeType }))
      }),
  }
}

export default function Interview() {
  const { id: sid = '' } = useParams()
  const location = useLocation()
  const navigate = useNavigate()
  const { session } = useAuth()

  const [questions, setQuestions] = useState<Question[] | null>((location.state as { questions?: Question[] } | null)?.questions ?? null)
  const [phase, setPhase] = useState<Phase>('loading')
  const [loadingText, setLoadingText] = useState('Starting your camera…')
  const [error, setError] = useState<string | null>(null)
  const [checks, setChecks] = useState<Checks>({ face: false, centered: false, distance: null, light: false, mic: false })
  const [calibrationNote, setCalibrationNote] = useState<string | null>(null)
  const [idx, setIdx] = useState(0)
  const [stage, setStage] = useState<Stage>('speaking')
  const [secondsLeft, setSecondsLeft] = useState(0)
  const [steps, setSteps] = useState<Record<StepKey, StepState>>({ upload: 'pending', analyze: 'pending', screens: 'pending', video: 'pending', score: 'pending' })
  const [processError, setProcessError] = useState<string | null>(null)
  const [recap, setRecap] = useState<{ idx: number; seconds: number; answered: boolean }[]>([])

  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const ctxRef = useRef<AudioContext | null>(null)
  const engineRef = useRef<VisionEngine | null>(null)
  const loopRef = useRef<CaptureLoop | null>(null)
  const calibrationRef = useRef<Calibration>({})
  const levelRef = useRef(0)
  const speechRef = useRef<Speech | null>(null)
  const audioUrls = useRef(new Map<number, Promise<string | null>>())
  const uploads = useRef(new Map<number, PendingUpload>())
  const videoUploads = useRef(new Map<number, Promise<void>>())
  const timerRef = useRef<number | null>(null)
  const answerRef = useRef<{ finish: () => void } | null>(null)
  const questionsRef = useRef<Question[] | null>(questions)
  const endRequested = useRef(false)
  useEffect(() => {
    questionsRef.current = questions
  }, [questions])

  const clearTimer = () => {
    if (timerRef.current !== null) window.clearInterval(timerRef.current)
    timerRef.current = null
  }

  const releaseCamera = useCallback(() => {
    clearTimer()
    speechRef.current?.stop()
    loopRef.current?.stop()
    loopRef.current = null
    engineRef.current?.close()
    engineRef.current = null
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    void ctxRef.current?.close()
    ctxRef.current = null
  }, [])

  // --- Setup: questions, camera, mic, vision models ---------------------------------
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        if (!questionsRef.current) {
          const { data, error } = await supabase.from('sessions').select('questions, status').eq('id', sid).single()
          if (error || !data) throw new Error('This session could not be found.')
          if (data.status === 'ready') return navigate(`/report/${sid}`, { replace: true })
          if (!cancelled) setQuestions(data.questions as Question[])
        }
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' },
          audio: { echoCancellation: true, noiseSuppression: true },
        })
        if (cancelled) return stream.getTracks().forEach((t) => t.stop())
        streamRef.current = stream
        const video = videoRef.current!
        video.srcObject = stream
        await video.play()
        if (cancelled) return

        const ctx = new AudioContext()
        ctxRef.current = ctx
        const meter = new LevelMeter(ctx, stream)

        setLoadingText('Loading the vision models…')
        const engine = await VisionEngine.create()
        if (cancelled) return engine.close()
        engineRef.current = engine

        const loop = new CaptureLoop(engine, video, meter)
        loopRef.current = loop
        let lastUi = 0
        let lastLoud = -Infinity
        loop.subscribe(({ features: f, level, now }) => {
          if (level > 0.02) lastLoud = now
          if (now - lastUi < 250) return
          lastUi = now
          setChecks({
            face: f.face === 1,
            centered: f.face === 1 && Math.abs((f.face_cx ?? 0) - 0.5) < 0.2 && Math.abs((f.face_cy ?? 0) - 0.45) < 0.25,
            distance: f.face_w == null ? null : f.face_w < 0.14 ? 'far' : f.face_w > 0.45 ? 'close' : 'ok',
            light: (f.light ?? 0) >= 0.25,
            mic: now - lastLoud < 3000,
          })
        })
        loop.start()
        setPhase('setup')
      } catch (e) {
        if (cancelled) return
        const err = e as DOMException
        setError(
          err.name === 'NotAllowedError'
            ? 'Camera or microphone access was blocked. Allow both in your browser settings, then reload.'
            : err.name === 'NotFoundError'
              ? 'No camera or microphone was found.'
              : err.message || 'Something went wrong while starting.',
        )
        setPhase('error')
      }
    })()
    return () => {
      cancelled = true
      releaseCamera()
    }
  }, [sid, navigate, releaseCamera])

  const audioFor = useCallback(
    (i: number) => {
      if (!audioUrls.current.has(i)) {
        audioUrls.current.set(i, api.questionAudio(sid, i).then((r) => r.url).catch(() => null))
      }
      return audioUrls.current.get(i)!
    },
    [sid],
  )

  // --- Calibration ------------------------------------------------------------------
  const startCalibration = async () => {
    await ctxRef.current?.resume() // needs this click to allow audio playback
    audioFor(0)
    setCalibrationNote(null)
    setPhase('calibrating')
    const ticks: Tick[] = []
    await new Promise((r) => setTimeout(r, 600)) // let the eyes settle on the dot
    const off = loopRef.current!.subscribe((t) => ticks.push(t))
    setSecondsLeft(Math.ceil(CALIBRATION_MS / 1000))
    const started = performance.now()
    clearTimer()
    timerRef.current = window.setInterval(() => {
      setSecondsLeft(Math.max(0, Math.ceil((CALIBRATION_MS - (performance.now() - started)) / 1000)))
    }, 200)
    await new Promise((r) => setTimeout(r, CALIBRATION_MS))
    clearTimer()
    off()
    const { calibration, faceShare } = calibrate(ticks)
    if (faceShare < 0.7 || calibration.yaw === undefined) {
      setCalibrationNote("We couldn't see your face clearly. Center yourself in good light and try again.")
      setPhase('setup')
      return
    }
    calibrationRef.current = calibration
    setPhase('interview')
    void askQuestion(0)
  }

  // --- The interview loop -------------------------------------------------------------
  const askQuestion = async (i: number) => {
    const qs = questionsRef.current!
    setIdx(i)
    setStage('speaking')
    if (i + 1 < qs.length) audioFor(i + 1)
    const url = await audioFor(i)
    const speech = speak(ctxRef.current!, url, qs[i].text, (l) => (levelRef.current = l))
    speechRef.current = speech
    await speech.done
    speechRef.current = null
    if (endRequested.current) return
    startThinking(i)
  }

  const startThinking = (i: number) => {
    setStage('thinking')
    levelRef.current = 0
    const end = performance.now() + THINK_SECONDS * 1000
    setSecondsLeft(THINK_SECONDS)
    clearTimer()
    timerRef.current = window.setInterval(() => {
      const left = Math.ceil((end - performance.now()) / 1000)
      setSecondsLeft(Math.max(0, left))
      if (left <= 0) startAnswer(i)
    }, 200)
  }

  const startAnswer = (i: number) => {
    clearTimer()
    if (endRequested.current || !streamRef.current) return
    const stream = streamRef.current
    const video = videoRef.current!
    setStage('answering')
    setSecondsLeft(ANSWER_SECONDS)

    const videoRec = startRecorder(stream, pickMime(['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4']), { video: 500_000, audio: 64_000 })
    const audioRec = startRecorder(new MediaStream(stream.getAudioTracks()), pickMime(['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4']), { audio: 32_000 })
    const started = performance.now()
    const signals = new SignalRecorder(video, calibrationRef.current, started)
    const off = loopRef.current!.subscribe((tick) => {
      signals.push(tick)
      levelRef.current = Math.min(1, tick.level * 6) // the waveform follows your voice
    })

    let finished = false
    const finish = async () => {
      if (finished) return
      finished = true
      clearTimer()
      answerRef.current = null
      setStage('saving')
      const ended = performance.now()
      off()
      levelRef.current = 0
      const [videoBlob, recorded] = await Promise.all([videoRec.stop(), audioRec.stop()])
      const audioBlob = await toWav(recorded).catch(() => recorded) // an empty clip can't be decoded; the server skips it
      const { payload, thumbnails } = signals.finish(ended)
      saveRecording(sid, i, videoBlob, thumbnails)
      if (videoBlob.size) {
        // Upload the replay in the background while the interview carries on.
        const ext = videoBlob.type.includes('mp4') ? 'mp4' : 'webm'
        videoUploads.current.set(
          i,
          supabase.storage
            .from('recordings')
            .upload(`${session!.user.id}/${sid}/${i}.${ext}`, videoBlob, { contentType: `video/${ext}`, upsert: true })
            .then(({ error }) => {
              if (error) throw error
            }),
        )
      }
      const pending: PendingUpload = { audio: audioBlob, payload, promise: null, done: false }
      pending.promise = api.uploadAnswer(sid, i, audioBlob, payload).then(() => (pending.done = true)).catch(() => {})
      uploads.current.set(i, pending)

      const total = questionsRef.current!.length
      if (i + 1 < total && !endRequested.current) void askQuestion(i + 1)
      else void finishSession()
    }
    answerRef.current = { finish }
    timerRef.current = window.setInterval(() => {
      const left = Math.ceil(ANSWER_SECONDS - (performance.now() - started) / 1000)
      setSecondsLeft(Math.max(0, left))
      if (left <= 0) void finish()
    }, 250)
  }

  const endEarly = () => {
    if (!window.confirm(uploads.current.size ? 'End the session now and get feedback on the answers so far?' : 'Leave this session?')) return
    endRequested.current = true
    if (stage === 'answering') {
      answerRef.current?.finish() // keep this answer, then wrap up
      return
    }
    if (!uploads.current.size) {
      releaseCamera()
      navigate('/')
      return
    }
    void finishSession()
  }

  // --- After the last answer ------------------------------------------------------------
  const runProcessing = useCallback(async () => {
    const mark = (key: StepKey, state: StepState) => setSteps((s) => ({ ...s, [key]: state }))
    setProcessError(null)
    let current: StepKey = 'upload'
    try {
      mark('upload', 'active')
      for (const [i, up] of uploads.current) {
        await up.promise
        if (!up.done) await api.uploadAnswer(sid, i, up.audio, up.payload).then(() => (up.done = true))
      }
      mark('upload', 'done')

      current = 'analyze'
      mark('analyze', 'active')
      const { flags } = await api.analyze(sid)
      mark('analyze', 'done')

      current = 'screens'
      mark('screens', 'active')
      mark('score', 'active')
      const userId = session!.user.id
      const screenshots = Promise.all(
        flags
          .filter((f) => f.screenshot)
          .map(async (f) => {
            const blob = nearestThumbnail(sid, f.answer_idx, f.worst_s)
            if (!blob) return
            await supabase.storage
              .from('screenshots')
              .upload(`${userId}/${sid}/${f.id}.jpg`, blob, { contentType: 'image/jpeg', upsert: true })
          }),
      ).then(() => mark('screens', 'done'))
      const scoring = api.score(sid).then(() => mark('score', 'done'))
      // A replay that fails to upload still plays in this tab, so it never blocks the report.
      mark('video', 'active')
      const replays = Promise.allSettled(videoUploads.current.values()).then((r) =>
        mark('video', r.some((x) => x.status === 'rejected') ? 'failed' : 'done'),
      )
      await Promise.all([screenshots, scoring, replays])
      navigate(`/report/${sid}`, { replace: true })
    } catch (e) {
      mark(current, 'failed')
      setProcessError((e as Error).message || 'Something went wrong.')
    }
  }, [sid, session, navigate])

  const finishSession = async () => {
    releaseCamera()
    // What was recorded, for the wrap-up screen. Clips under 1.5s are skipped questions (the server agrees).
    setRecap([...uploads.current].map(([i, up]) => ({ idx: i, seconds: up.payload.duration_s, answered: up.payload.duration_s >= 1.5 })))
    setPhase('processing')
    await runProcessing()
  }

  // --- Render -----------------------------------------------------------------------
  const qs = questions ?? []
  const waveState: WaveState =
    phase !== 'interview' ? 'idle' : stage === 'speaking' ? 'speaking' : stage === 'answering' ? 'listening' : 'thinking'
  const allGood = checks.face && checks.centered && checks.distance === 'ok' && checks.light
  const talkTime = recap.reduce((sum, r) => sum + (r.answered ? r.seconds : 0), 0)

  return (
    <div className={`room room--${phase}`}>
      <header className="room__bar">
        <span className="brand brand--small">
          <BrandMark size={18} />
          <span>Kemo AI</span>
        </span>
        {phase === 'interview' && (
          <>
            <span className="room__progress" aria-live="polite">Question {idx + 1} of {qs.length}</span>
            <button className="btn btn--ghost btn--sm" onClick={endEarly}>End session</button>
          </>
        )}
      </header>

      {phase === 'interview' && (
        <section className="question-card" aria-live="polite">
          <p className="question-card__label">Question {idx + 1}</p>
          <h1 className="question-card__text">{qs[idx]?.text}</h1>
        </section>
      )}

      <div className={`room__stage${phase === 'setup' ? ' room__stage--setup' : ''}`}>
        {phase === 'interview' && <VoiceWave levelRef={levelRef} state={waveState} />}
        <div className={`selfview selfview--${phase === 'interview' ? 'small' : 'large'}`}>
          <video ref={videoRef} muted playsInline className="mirror" />
          {phase === 'calibrating' && (
            <div className="calibrate-overlay">
              <span className="calibrate-count">{secondsLeft || '·'}</span>
            </div>
          )}
          {phase === 'interview' && stage === 'answering' && <span className="rec-dot">REC</span>}
        </div>

        {phase === 'setup' && (
          <div className="room__panel card setup">
            <h2>Camera check</h2>
            <ul className="checks">
              <li className={checks.face ? 'ok' : ''}>Your face is visible</li>
              <li className={checks.centered ? 'ok' : ''}>You're centered in the frame</li>
              <li className={checks.distance === 'ok' ? 'ok' : ''}>
                {checks.distance === 'far' ? 'Move a little closer' : checks.distance === 'close' ? 'Sit back a little' : 'Good distance from the camera'}
              </li>
              <li className={checks.light ? 'ok' : ''}>{checks.light ? 'Lighting looks good' : 'Find more light on your face'}</li>
              <li className={checks.mic ? 'ok' : ''}>{checks.mic ? 'Microphone is working' : 'Say something to test your mic'}</li>
            </ul>
            {calibrationNote && <p className="error">{calibrationNote}</p>}
            <p className="muted small">
              Next, look straight at your camera lens for 3 seconds so we learn what eye contact looks like on your setup.
            </p>
            <div className="actions">
              <button className="btn btn--primary btn--lg" onClick={startCalibration}>
                {allGood ? "I'm ready" : 'Continue anyway'}
              </button>
            </div>
          </div>
        )}
      </div>

      {phase === 'loading' && (
        <div className="room__panel">
          <div className="spinner" />
          <p>{loadingText}</p>
        </div>
      )}

      {phase === 'error' && (
        <div className="room__panel card">
          <h2>We couldn't start the session</h2>
          <p className="error">{error}</p>
          <button className="btn btn--primary" onClick={() => window.location.reload()}>Try again</button>
        </div>
      )}

      {phase === 'calibrating' && (
        <div className="calibrate-target" role="status">
          <span className="calibrate-dot" />
          <p><strong>Look at your camera lens</strong>, just above this dot, and hold still.</p>
        </div>
      )}

      {phase === 'interview' && (
        <div className="room__controls">
          {stage === 'speaking' && (
            <button className="btn btn--ghost" onClick={() => speechRef.current?.stop()}>Skip reading</button>
          )}
          {stage === 'thinking' && (
            <>
              <p className="muted">Take a moment to think · answering starts in {secondsLeft}s</p>
              <button className="btn btn--primary btn--lg" onClick={() => startAnswer(idx)}>Start answering</button>
            </>
          )}
          {stage === 'answering' && (
            <>
              <p className="timer" aria-live="off">
                {formatTime(ANSWER_SECONDS - secondsLeft)} <span className="muted">/ {formatTime(ANSWER_SECONDS)}</span>
              </p>
              <button className="btn btn--primary btn--lg" onClick={() => answerRef.current?.finish()}>Done</button>
            </>
          )}
          {stage === 'saving' && <p className="muted">Saving your answer…</p>}
        </div>
      )}

      {phase === 'processing' && (
        <div className="wrapup">
          <section className="wrapup__recap">
            <p className="eyebrow">Session complete</p>
            <h1>That's a wrap.</h1>
            <p className="lead">
              You answered {recap.filter((r) => r.answered).length} of {qs.length} questions
              {talkTime > 0 && <> · {formatTime(talkTime)} of talking</>}.
            </p>
            <ol className="recap">
              {qs.map((q, i) => {
                const r = recap.find((x) => x.idx === i)
                return (
                  <li key={q.id}>
                    <span className="recap__num">Q{i + 1}</span>
                    <span className="recap__text">{q.text}</span>
                    <span className="recap__time">{!r ? 'Not reached' : r.answered ? formatTime(r.seconds) : 'Skipped'}</span>
                  </li>
                )
              })}
            </ol>
          </section>
          <div className="card processing">
            <h2>Building your report</h2>
            <ol className="steps">
              {STEPS.map(([key, label]) => (
                <li key={key} className={`step step--${steps[key]}`}>{label}</li>
              ))}
            </ol>
            {processError && (
              <>
                <p className="error">{processError}</p>
                <button className="btn btn--primary" onClick={runProcessing}>Try again</button>
              </>
            )}
            <p className="muted small">Don't close this tab until your report opens.</p>
          </div>
        </div>
      )}
    </div>
  )
}
