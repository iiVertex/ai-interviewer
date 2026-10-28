import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
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

/** An answer's replay, with a fix for MediaRecorder files that report no duration. */
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
  return <video ref={ref} src={url} controls playsInline className="replay" />
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
        {fb.worked.length > 0 && (
          <div>
            <h4>What worked</h4>
            <ul>{fb.worked.map((x) => <li key={x}>{x}</li>)}</ul>
          </div>
        )}
        <div>
          <h4>What was missing</h4>
          <ul>{fb.missing.map((x) => <li key={x}>{x}</li>)}</ul>
        </div>
      </div>
      {fb.stronger_answer && (
        <details className="stronger">
          <summary>A stronger version of this answer</summary>
          <p>{fb.stronger_answer}</p>
        </details>
      )}
    </div>
  )
}

function QuestionPanel({
  idx,
  total,
  question,
  answer: a,
  fb,
  flags,
  shots,
  recUrl,
  seekTo,
  onReplay,
  saved,
  saving,
  onToggleSaved,
}: {
  idx: number
  total: number
  question: string
  answer: AnswerRow | undefined
  fb: AnswerFeedback | undefined
  flags: Flag[]
  shots: Record<string, string>
  recUrl: string | undefined
  seekTo: { t: number; n: number } | null
  onReplay: (flag: Flag) => void
  saved: boolean
  saving: boolean
  onToggleSaved: () => void
}) {
  const m = a?.metrics ?? {}
  const issues = flags.filter((f) => f.kind === 'issue')
  const highlights = flags.filter((f) => f.kind === 'highlight')
  const card = (f: Flag) => (
    <FlagCard key={f.id} flag={f} screenshotUrl={shots[f.id]} onReplay={recUrl ? () => onReplay(f) : undefined} />
  )
  return (
    <article id="answer-panel" role="tabpanel" aria-labelledby={`qtab-${idx}`} className="card answer qpanel">
      <header className="answer__head">
        <div>
          <p className="eyebrow">Question {idx + 1} of {total}</p>
          <h3>{question}</h3>
        </div>
        <div className="answer__tools">
          {fb && <span className={`score-pill score-pill--${scoreTone(fb.score)}`} title="Content score">{fb.score}</span>}
          <button className={`btn btn--sm ${saved ? 'btn--primary' : 'btn--ghost'}`} onClick={onToggleSaved} disabled={saving} aria-pressed={saved}>
            {saved ? 'Saved to practice bank' : 'Save to practice bank'}
          </button>
        </div>
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

            <h4 className="answer__section">Moments to work on</h4>
            {issues.length ? <div className="flag-grid">{issues.map(card)}</div> : <p className="muted">Nothing stood out in this answer.</p>}
            {highlights.length > 0 && (
              <>
                <h4 className="answer__section">Your strongest moment</h4>
                <div className="flag-grid">{highlights.map(card)}</div>
              </>
            )}

            <h4 className="answer__section">What you said</h4>
            <Transcript words={a.transcript?.words ?? []} />
            {fb && <ContentFeedback fb={fb} />}
          </div>
          {recUrl && (
            <aside className="answer__replay" id="answer-replay">
              <Replay url={recUrl} seekTo={seekTo} />
              <p className="muted small">Only you can see this recording.</p>
            </aside>
          )}
        </div>
      )}
    </article>
  )
}

export default function Report() {
  const { id: sid = '' } = useParams()
  const navigate = useNavigate()
  const [session, setSession] = useState<SessionRow | null>(null)
  const [answers, setAnswers] = useState<AnswerRow[]>([])
  const [shots, setShots] = useState<Record<string, string>>({})
  const [videos, setVideos] = useState<Record<number, string>>({})
  const [error, setError] = useState<string | null>(null)
  const [retrying, setRetrying] = useState(false)
  const [seek, setSeek] = useState<Record<number, { t: number; n: number }>>({})
  const [saved, setSaved] = useState<Record<string, string>>({}) // question text -> saved_questions id
  const [saving, setSaving] = useState(false)
  const [params, setParams] = useSearchParams()

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

  // Replays saved to storage, named by answer index: {user_id}/{session_id}/{idx}.webm
  useEffect(() => {
    if (!session) return
    const folder = `${session.user_id}/${sid}`
    const bucket = supabase.storage.from('recordings')
    bucket.list(folder).then(async ({ data: files }) => {
      if (!files?.length) return
      const { data } = await bucket.createSignedUrls(files.map((f) => `${folder}/${f.name}`), 3600)
      const map: Record<number, string> = {}
      data?.forEach((d, i) => d.signedUrl && (map[parseInt(files[i].name, 10)] = d.signedUrl))
      setVideos(map)
    })
  }, [session, sid])

  // Which of this session's questions are already in the practice bank
  useEffect(() => {
    if (!session) return
    supabase
      .from('saved_questions')
      .select('id, text')
      .in('text', session.questions.map((q) => q.text))
      .then(({ data }) => setSaved(Object.fromEntries((data ?? []).map((r) => [r.text, r.id]))))
  }, [session])

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
  const durations = session.questions.map((_, i) => answers.find((a) => a.idx === i)?.duration_s ?? 0)

  // This tab's own copy plays instantly; otherwise fall back to the saved one.
  const replayUrl = (i: number) => getRecording(sid, i)?.videoUrl ?? videos[i]

  const count = session.questions.length
  const active = Math.min(count - 1, Math.max(0, (parseInt(params.get('q') ?? '1', 10) || 1) - 1))
  const show = (i: number) => {
    setParams({ q: String(i + 1) }, { replace: true, preventScrollReset: true })
    // Deep inside a long answer, start the next one from its top rather than mid-way down.
    const panel = document.getElementById('answer-panel')
    if (panel && panel.getBoundingClientRect().top < 0) document.getElementById('questions')?.scrollIntoView({ block: 'start' })
  }

  const onTabKey = (e: KeyboardEvent) => {
    const step = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0
    if (!step) return
    e.preventDefault()
    const next = (active + step + count) % count
    show(next)
    document.getElementById(`qtab-${next}`)?.focus()
  }

  const seekTo = (flag: Flag) =>
    setSeek((s) => ({ ...s, [flag.answer_idx]: { t: flag.start_s - 1, n: (s[flag.answer_idx]?.n ?? 0) + 1 } }))
  const replay = (flag: Flag) => {
    document.getElementById('answer-replay')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    seekTo(flag)
  }
  // From the timeline: open that question, bring the moment's card into view and play it.
  const select = (flag: Flag) => {
    show(flag.answer_idx)
    requestAnimationFrame(() => document.getElementById(`flag-${flag.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }))
    if (replayUrl(flag.answer_idx)) seekTo(flag)
  }

  const toggleSaved = async (i: number) => {
    const text = session.questions[i].text
    setSaving(true)
    if (saved[text]) {
      const { error } = await supabase.from('saved_questions').delete().eq('id', saved[text])
      if (error) setError(error.message)
      else
        setSaved((s) => {
          const next = { ...s }
          delete next[text]
          return next
        })
    } else {
      const { data, error } = await supabase
        .from('saved_questions')
        .insert({
          user_id: session.user_id,
          text,
          mode: session.mode,
          role: session.config.role ?? null,
          session_id: sid,
          answer_idx: i,
          score: feedbackByIdx.get(i)?.score ?? null,
        })
        .select('id')
        .single()
      if (error) setError(error.message)
      else setSaved((s) => ({ ...s, [text]: data.id }))
    }
    setSaving(false)
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
          {session.content.top_fixes.length > 0 && (
            <>
              <h2>Your top {session.content.top_fixes.length} fixes</h2>
              <ol className="fix-list">
                {session.content.top_fixes.map((f) => (
                  <li key={f.title}><strong>{f.title}</strong><span>{f.detail}</span></li>
                ))}
              </ol>
            </>
          )}
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

      <section id="questions">
        <h2>Question by question</h2>
        <div className="qtabs" role="tablist" aria-label="Questions" onKeyDown={onTabKey}>
          {session.questions.map((q, i) => {
            const fb = feedbackByIdx.get(i)
            const n = issues.filter((f) => f.answer_idx === i).length
            return (
              <button
                key={q.id}
                id={`qtab-${i}`}
                role="tab"
                aria-selected={i === active}
                aria-controls="answer-panel"
                tabIndex={i === active ? 0 : -1}
                className="qtab"
                onClick={() => show(i)}
              >
                <span className="qtab__num">Q{i + 1}</span>
                <span className={`qtab__score qtab__score--${scoreTone(fb?.score)}`}>{fb?.score ?? '–'}</span>
                {n > 0 && <span className="qtab__count" title={`${n} moment${n > 1 ? 's' : ''} to work on`}>{n}</span>}
              </button>
            )
          })}
        </div>
        <QuestionPanel
          key={active}
          idx={active}
          total={count}
          question={session.questions[active].text}
          answer={answers.find((x) => x.idx === active)}
          fb={feedbackByIdx.get(active)}
          flags={flags.filter((f) => f.answer_idx === active)}
          shots={shots}
          recUrl={replayUrl(active)}
          seekTo={seek[active] ?? null}
          onReplay={replay}
          saved={Boolean(saved[session.questions[active].text])}
          saving={saving}
          onToggleSaved={() => toggleSaved(active)}
        />
      </section>

      <section className="danger-zone">
        <button className="btn btn--danger btn--sm" onClick={remove}>Delete this session</button>
      </section>
    </Layout>
  )
}
