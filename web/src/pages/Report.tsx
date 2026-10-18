import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { FlagCard } from '../components/FlagCard'
import { Layout } from '../components/Layout'
import { ScoreRing } from '../components/ScoreRing'
import { Timeline } from '../components/Timeline'
import { api } from '../lib/api'
import { formatTime, scoreTone } from '../lib/format'
import { forgetRecordings, getRecording } from '../lib/recordings'
import { supabase } from '../lib/supabase'
import {
  CATEGORY_LABELS,
  MODE_LABELS,
  type AnswerFeedback,
  type AnswerRow,
  type Category,
  type Flag,
  type SessionRow,
  type TranscriptWord,
} from '../lib/types'

const CATEGORIES: Category[] = ['eye_contact', 'expressiveness', 'composure', 'delivery', 'content']
const PAUSE_MARK_S = 3

/** Video from this tab's memory, with a fix for MediaRecorder files that report no duration. */
function Replay({ url, seekTo }: { url: string; seekTo: { t: number; n: number } | null }) {
  const ref = useRef<HTMLVideoElement>(null)
  useEffect(() => {
    const v = ref.current
    if (!v) return
    const fixDuration = () => {
      if (v.duration === Infinity) {
        v.currentTime = 1e101
        v.addEventListener('durationchange', () => (v.currentTime = 0), { once: true })
      }
    }
    v.addEventListener('loadedmetadata', fixDuration, { once: true })
    return () => v.removeEventListener('loadedmetadata', fixDuration)
  }, [url])
  useEffect(() => {
    const v = ref.current
    if (!v || !seekTo) return
    v.currentTime = Math.max(0, seekTo.t)
    void v.play().catch(() => {})
  }, [seekTo])
  return <video ref={ref} src={url} controls playsInline className="replay mirror" />
}

function Transcript({ words }: { words: TranscriptWord[] }) {
  if (!words.length) return <p className="muted">No speech was detected for this answer.</p>
  return (
    <p className="transcript">
      {words.map((w, i) => {
        const gap = i > 0 ? w.s - words[i - 1].e : 0
        return (
          <span key={i}>
            {gap >= PAUSE_MARK_S && <span className="pause-mark" title="Long pause">pause {Math.round(gap)}s</span>}
            <span className={w.f ? 'filler' : undefined}>{w.w}</span>{' '}
          </span>
        )
      })}
    </p>
  )
}

function ContentFeedback({ fb }: { fb: AnswerFeedback }) {
  return (
    <div className="feedback">
      <div className="rubric">
        {fb.rubric.map((r) => (
          <div key={r.criterion} className="rubric__row" title={r.comment}>
            <span>{r.criterion}</span>
            <span className="rubric__dots" aria-label={`${r.score} out of 5`}>
              {[1, 2, 3, 4, 5].map((n) => (
                <span key={n} className={n <= r.score ? 'dot dot--on' : 'dot'} />
              ))}
            </span>
          </div>
        ))}
      </div>
      <div className="feedback__lists">
        <div>
          <h4>What worked</h4>
          <ul>{fb.worked.map((x) => <li key={x}>{x}</li>)}</ul>
        </div>
        <div>
          <h4>What was missing</h4>
          <ul>{fb.missing.map((x) => <li key={x}>{x}</li>)}</ul>
        </div>
      </div>
      <details className="stronger">
        <summary>A stronger version of this answer</summary>
        <p>{fb.stronger_answer}</p>
      </details>
    </div>
  )
}

export default function Report() {
  const { id: sid = '' } = useParams()
  const navigate = useNavigate()
  const [session, setSession] = useState<SessionRow | null>(null)
  const [answers, setAnswers] = useState<AnswerRow[]>([])
  const [shots, setShots] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)
  const [retrying, setRetrying] = useState(false)
  const [seek, setSeek] = useState<Record<number, { t: number; n: number }>>({})

  const load = useCallback(async () => {
    const [{ data: s, error: e1 }, { data: a, error: e2 }] = await Promise.all([
      supabase.from('sessions').select('*').eq('id', sid).single(),
      supabase.from('session_answers').select('*').eq('session_id', sid).order('idx'),
    ])
    if (e1 || !s) {
      setError('This report could not be found.')
      return null
    }
    if (e2) setError(e2.message)
    setSession(s as SessionRow)
    setAnswers((a ?? []) as AnswerRow[])
    return s as SessionRow
  }, [sid])

  useEffect(() => {
    let timer = 0
    let cancelled = false
    const poll = async () => {
      const s = await load()
      if (!cancelled && s && s.status !== 'ready') timer = window.setTimeout(poll, 3000)
    }
    void poll()
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [load])

  useEffect(() => {
    if (!session) return
    const withShots = session.flags.filter((f) => f.screenshot)
    if (!withShots.length) return
    const paths = withShots.map((f) => `${session.user_id}/${sid}/${f.id}.jpg`)
    supabase.storage
      .from('screenshots')
      .createSignedUrls(paths, 3600)
      .then(({ data }) => {
        const map: Record<string, string> = {}
        data?.forEach((d, i) => d.signedUrl && (map[withShots[i].id] = d.signedUrl))
        setShots(map)
      })
  }, [session, sid])

  const feedbackByIdx = useMemo(() => {
    const m = new Map<number, AnswerFeedback>()
    session?.content?.answers.forEach((fb) => m.set(fb.index, fb))
    return m
  }, [session])

  if (error && !session) {
    return (
      <Layout>
        <div className="card notice"><p className="error">{error}</p></div>
      </Layout>
    )
  }
  if (!session) {
    return <Layout><div className="center-screen"><div className="spinner" /></div></Layout>
  }
  if (session.status !== 'ready') {
    return (
      <Layout>
        <div className="card notice">
          <div className="spinner" />
          <h1>Your report is still being prepared</h1>
          <p className="muted">This page refreshes on its own.</p>
        </div>
      </Layout>
    )
  }

  const scores = session.scores ?? {}
  const flags = session.flags
  const issues = flags.filter((f) => f.kind === 'issue')
  const highlights = flags.filter((f) => f.kind === 'highlight')
  const durations = session.questions.map((_, i) => answers.find((a) => a.idx === i)?.duration_s ?? 0)

  const replay = (flag: Flag) => {
    document.getElementById(`answer-${flag.answer_idx}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    setSeek((s) => ({ ...s, [flag.answer_idx]: { t: flag.start_s - 1, n: (s[flag.answer_idx]?.n ?? 0) + 1 } }))
  }
  const select = (flag: Flag) => {
    document.getElementById(`flag-${flag.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    if (getRecording(sid, flag.answer_idx)) replay(flag)
  }

  const retryFeedback = async () => {
    setRetrying(true)
    try {
      await api.score(sid)
      await load()
    } catch (e) {
      setError((e as Error).message)
    }
    setRetrying(false)
  }

  const remove = async () => {
    if (!window.confirm('Delete this session and everything saved for it? This cannot be undone.')) return
    await api.deleteSession(sid)
    forgetRecordings(sid)
    navigate('/', { replace: true })
  }

  return (
    <Layout wide>
      <section className="report-head card">
        <div className="report-head__score">
          <ScoreRing value={scores.overall} size={148} label="Overall" />
          <div>
            <p className="eyebrow">{MODE_LABELS[session.mode]}{session.config.role ? ` · ${session.config.role}` : ''}</p>
            <h1>Your session report</h1>
            <p className="muted">{new Date(session.created_at).toLocaleString(undefined, { dateStyle: 'long', timeStyle: 'short' })}</p>
          </div>
        </div>
        <div className="category-bars">
          {CATEGORIES.map((c) => (
            <div key={c} className="bar">
              <span className="bar__label">{CATEGORY_LABELS[c]}</span>
              <span className="bar__track">
                <span className={`bar__fill bar__fill--${scoreTone(scores[c])}`} style={{ width: `${scores[c] ?? 0}%` }} />
              </span>
              <span className="bar__value">{scores[c] ?? '–'}</span>
            </div>
          ))}
        </div>
      </section>

      {session.content ? (
        <section className="card fixes">
          <p className="summary">{session.content.summary}</p>
          <h2>Your top 3 fixes</h2>
          <ol className="fix-list">
            {session.content.top_fixes.map((f) => (
              <li key={f.title}><strong>{f.title}</strong><span>{f.detail}</span></li>
            ))}
          </ol>
        </section>
      ) : (
        <section className="card notice">
          <p>We couldn't get feedback on what you said this time{session.error ? ` (${session.error})` : ''}. Everything else below is ready.</p>
          <button className="btn btn--primary btn--sm" onClick={retryFeedback} disabled={retrying}>
            {retrying ? 'Retrying…' : 'Retry answer feedback'}
          </button>
        </section>
      )}

      <section>
        <h2>Session timeline</h2>
        <Timeline durations={durations} flags={flags} onSelect={select} />
      </section>

      <section>
        <h2>Moments to work on</h2>
        {issues.length === 0 ? (
          <p className="muted">Nothing stood out. Great job!</p>
        ) : (
          <div className="flag-grid">
            {issues.map((f) => (
              <FlagCard key={f.id} flag={f} screenshotUrl={shots[f.id]} onReplay={getRecording(sid, f.answer_idx) ? () => replay(f) : undefined} />
            ))}
          </div>
        )}
        {highlights.length > 0 && (
          <>
            <h2>Your strongest moments</h2>
            <div className="flag-grid">
              {highlights.map((f) => (
                <FlagCard key={f.id} flag={f} screenshotUrl={shots[f.id]} onReplay={getRecording(sid, f.answer_idx) ? () => replay(f) : undefined} />
              ))}
            </div>
          </>
        )}
      </section>

      <section>
        <h2>Question by question</h2>
        {session.questions.map((q, i) => {
          const a = answers.find((x) => x.idx === i)
          const fb = feedbackByIdx.get(i)
          const rec = getRecording(sid, i)
          const m = a?.metrics ?? {}
          return (
            <article key={q.id} id={`answer-${i}`} className="card answer">
              <header className="answer__head">
                <div>
                  <p className="eyebrow">Question {i + 1}</p>
                  <h3>{q.text}</h3>
                </div>
                {fb && <span className={`score-pill score-pill--${scoreTone(fb.score)}`} title="Content score">{fb.score}</span>}
              </header>
              {!a ? (
                <p className="muted">Not answered.</p>
              ) : (
                <div className="answer__body">
                  <div className="answer__main">
                    <div className="stats">
                      <span><strong>{formatTime(a.duration_s)}</strong> long</span>
                      <span><strong>{m.wpm ?? '–'}</strong> words/min</span>
                      <span><strong>{m.filler_count ?? 0}</strong> filler words</span>
                      <span><strong>{m.long_pauses ?? 0}</strong> long pauses</span>
                      <span><strong>{m.eye_contact_pct == null ? '–' : `${Math.round(m.eye_contact_pct * 100)}%`}</strong> eye contact</span>
                    </div>
                    <Transcript words={a.transcript?.words ?? []} />
                    {fb && <ContentFeedback fb={fb} />}
                  </div>
                  {rec && (
                    <aside className="answer__replay">
                      <Replay url={rec.videoUrl} seekTo={seek[i] ?? null} />
                      <p className="muted small">Replay is available until you close this tab.</p>
                    </aside>
                  )}
                </div>
              )}
            </article>
          )
        })}
      </section>

      <section className="danger-zone">
        <button className="btn btn--danger btn--sm" onClick={remove}>Delete this session</button>
      </section>
    </Layout>
  )
}
