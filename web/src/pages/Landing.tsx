import { useEffect, useState, type CSSProperties, type FormEvent, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import Lenis from 'lenis'
import 'lenis/dist/lenis.css'
import { BrandMark } from '../components/BrandMark'
import { ThemeToggle } from '../components/ThemeToggle'
import { useAuth } from '../lib/auth'

const icon = (children: ReactNode) => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {children}
  </svg>
)

const FEATURES: [string, string, ReactNode][] = [
  [
    'Eye contact',
    'When your gaze drifted from the camera, and for how long.',
    icon(<><path d="M2 12s3.6-6 10-6 10 6 10 6-3.6 6-10 6S2 12 2 12Z" /><circle cx="12" cy="12" r="2.5" /></>),
  ],
  [
    'Expression & posture',
    'Flat stretches, slouching and fidgeting, with a screenshot.',
    icon(<><circle cx="12" cy="12" r="8.5" /><path d="M9 14.5c.8.9 1.8 1.4 3 1.4s2.2-.5 3-1.4M9.5 9.5v1M14.5 9.5v1" /></>),
  ],
  [
    'Delivery',
    'Pace, filler words and long pauses on a timeline.',
    icon(<path d="M3 12h1.5M7.5 8v8M11.5 4.5v15M15.5 8.5v7M19.5 11v2" />),
  ],
  [
    'Answer quality',
    'Structure, relevance and examples, plus a stronger answer.',
    icon(<path d="M12 7.5 16.5 12 12 16.5 7.5 12ZM12 2.5v2.5M12 19v2.5M2.5 12H5M19 12h2.5" />),
  ],
]

const STEPS = [
  ['Pick a session', 'A job interview, a student interview or open speaking practice. Add the role and paste the job post if you have one.'],
  ['Answer on camera', 'An AI interviewer asks five questions out loud. You get a moment to think, then up to two minutes per answer.'],
  ['Measured as you speak', 'Gaze, expression and posture are read in your browser. Pace, fillers and pauses come from your transcript.'],
  ['Read your report', 'Scores per category, a timeline of flagged moments with screenshots, and the three fixes that matter most.'],
]

const PRIVACY = [
  ['Your video stays in your browser', 'Face and posture analysis runs on your device while you record. No AI ever sees your video.'],
  ['Only text reaches the AI', 'Each answer is transcribed, then the audio is discarded. Only the transcripts are sent for feedback.'],
  ['Recordings are private', 'Your answers are saved so you can replay them. Nobody else can see them.'],
  ['Delete anything, any time', 'Deleting a session removes its recordings, transcripts, scores and screenshots.'],
]

const stagger = (i: number) => ({ '--i': i }) as CSSProperties

/** One two-minute answer as a waveform, with the moments a report would flag pinned to it. */
const WAVE_BARS = 112
const PAUSE = [52, 58] // a silent stretch, in bar indexes
// `raised` lifts a label above its neighbour; `wide` labels are hidden on phones
const MARKS = [
  { at: 18, time: '00:21', label: 'Um ×2', color: 'var(--cat-delivery)', raised: false, wide: false },
  { at: 71, time: '01:16', label: 'Gaze drifted', color: 'var(--cat-eye_contact)', raised: false, wide: true },
  { at: 90, time: '01:37', label: 'Strong example', color: 'var(--cat-highlight)', raised: true, wide: false },
]
const BARS = Array.from({ length: WAVE_BARS }, (_, i) => {
  if (i >= PAUSE[0] && i <= PAUSE[1]) return 0.04
  // Phrases swell and fade, with syllable-scale jitter on top
  const phrase = 0.45 + 0.55 * Math.abs(Math.sin(i * 0.11 + 0.6))
  const syllable = 0.35 + 0.65 * Math.abs(Math.sin(i * 1.7) * Math.cos(i * 0.37))
  return Math.max(0.08, phrase * syllable)
})
const markAt = (i: number) => MARKS.find((m) => Math.abs((i / WAVE_BARS) * 100 - m.at) < 2.2)

function HeroBackdrop() {
  return (
    <div className="hero-visual" aria-hidden="true">
      <span className="hero-visual__glow" />
      <span className="hero-visual__streak" />
    </div>
  )
}

function HeroWave() {
  return (
    <div className="hero-wave" aria-hidden="true">
      <div className="hero-wave__bars">
        {BARS.map((h, i) => (
          <span
            key={i}
            className="hero-wave__bar"
            style={{ '--h': h, '--i': i, '--c': markAt(i)?.color } as CSSProperties}
          />
        ))}
      </div>
      {MARKS.map((m) => (
        <span
          key={m.time}
          className={['hero-wave__mark', m.raised && 'hero-wave__mark--raised', m.wide && 'hero-wave__mark--wide', m.at > 80 && 'hero-wave__mark--end'].filter(Boolean).join(' ')}
          style={{ '--x': m.at, '--c': m.color } as CSSProperties}
        >
          <span className="hero-wave__label">
            <span className="hero-wave__time">{m.time}</span>
            {m.label}
          </span>
        </span>
      ))}
      <span className="hero-wave__sweep"><span className="hero-wave__playhead" /></span>
      <div className="hero-wave__axis">
        {['00:00', '00:30', '01:00', '01:30', '02:00'].map((t) => <span key={t}>{t}</span>)}
      </div>
    </div>
  )
}

function AuthForm() {
  const { signIn, signUp } = useAuth()
  const [creating, setCreating] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    setInfo(null)
    try {
      if (creating) {
        const { needsConfirmation } = await signUp(email.trim(), password)
        if (needsConfirmation) {
          setInfo('Check your inbox for a confirmation link, then sign in here.')
          setCreating(false)
        }
      } else {
        await signIn(email.trim(), password)
      }
    } catch (err) {
      setError((err as Error).message)
    }
    setBusy(false)
  }

  const toggle = () => {
    setCreating((c) => !c)
    setError(null)
    setInfo(null)
  }

  return (
    <form className="auth-card" onSubmit={submit}>
      <p className="auth-card__title">{creating ? 'Create an account' : 'Sign in'}</p>
      <label className="field">
        Email
        <input id="email" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
      </label>
      <label className="field">
        Password
        <input
          type="password"
          required
          minLength={creating ? 6 : undefined}
          autoComplete={creating ? 'new-password' : 'current-password'}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </label>
      {error && <p className="error small" role="alert">{error}</p>}
      {info && <p className="small" role="status">{info}</p>}
      <button className="btn btn--primary btn--lg" type="submit" disabled={busy}>
        {busy ? 'One moment…' : creating ? 'Create account' : 'Sign in'}
      </button>
      <p className="muted small auth-card__switch">
        {creating ? 'Already have an account?' : 'New here?'}{' '}
        <button type="button" className="link-btn" onClick={toggle}>
          {creating ? 'Sign in' : 'Create an account'}
        </button>
      </p>
    </form>
  )
}

export default function Landing() {
  const focusForm = () => document.getElementById('email')?.focus({ preventScroll: true })

  // Eased wheel scrolling and section links on the landing page only; touch keeps native scrolling
  useEffect(() => {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const lenis = new Lenis({ autoRaf: true, anchors: true })
    return () => lenis.destroy()
  }, [])

  return (
    <div className="site">
      <div className="site-top">
        <HeroBackdrop />
        <header className="topbar topbar--site">
          <Link to="/" className="brand">
            <BrandMark />
            <span>Kemo AI</span>
          </Link>
          <nav className="topbar__links" aria-label="Sections">
            <a className="topbar__link" href="#measure">What we measure</a>
            <a className="topbar__link" href="#how">How it works</a>
            <a className="topbar__link" href="#privacy">Privacy</a>
          </nav>
          <div className="topbar__end">
            <ThemeToggle />
            <a href="#start" className="topbar__cta" onClick={focusForm}>Sign in</a>
          </div>
        </header>

        <HeroWave />

        <section className="hero">
          <div className="hero__type">
            <h1 className="hero__title stagger" style={stagger(0)}>
              Mock interview
            </h1>
            <p className="hero__caption stagger" style={stagger(1)}>
              An AI interviewer
              <br />
              that shows you
              <br />
              what to fix
            </p>
            <div className="hero__cta-wrap stagger" style={stagger(2)}>
              <a href="#start" className="hero__cta" onClick={focusForm}>Start practicing</a>
            </div>
          </div>
        </section>
      </div>

      <section className="intro" id="measure">
        <ul className="intro__list">
          {FEATURES.map(([title, body, glyph]) => (
            <li key={title} className="intro__item">
              {glyph}
              <span>
                <strong>{title}</strong>
                <span className="muted">{body}</span>
              </span>
            </li>
          ))}
        </ul>
        <div className="intro__text">
          <p className="intro__statement">Rehearse out loud. See every moment that worked, and every one that didn't.</p>
          <p className="muted">
            Answer real interview questions on camera. Your report puts each flagged moment on a timeline, with a
            screenshot and one concrete fix.
          </p>
        </div>
        <div className="intro__tile" aria-hidden="true">
          <span className="intro__tile-shade" />
          <div className="intro__tile-art">
            <span className="intro__tile-glow" />
            <svg viewBox="0 0 200 200">
              <circle cx="100" cy="100" r="74" strokeDasharray="1 6" />
            </svg>
            <span className="intro__tile-label">Q2 · 01:14 — gaze drifted</span>
          </div>
        </div>
      </section>

      <section className="band" aria-labelledby="band-title">
        <div className="band__art" aria-hidden="true">
          <span className="band__blob band__blob--a" />
          <span className="band__blob band__blob--b" />
          <span className="band__blob band__blob--c" />
          <svg className="band__rings" viewBox="0 0 1000 400" preserveAspectRatio="xMidYMid slice">
            <circle cx="330" cy="210" r="150" strokeDasharray="1 7" />
            <circle cx="700" cy="190" r="105" strokeDasharray="1 7" />
          </svg>
        </div>
        <h2 id="band-title" className="band__title">Every second of every answer, measured.</h2>
        <div className="band__foot">
          <dl className="band__stats">
            <div><dt>Eye contact</dt><dd>82%</dd></div>
            <div><dt>Pace</dt><dd>148 wpm</dd></div>
            <div><dt>Filler words</dt><dd>3</dd></div>
            <div><dt>Longest pause</dt><dd>2.4s</dd></div>
          </dl>
          <p className="band__note">Sample session</p>
        </div>
      </section>

      <section className="how" id="how">
        <div className="how__head">
          <p className="eyebrow">How it works</p>
          <h2>Fifteen minutes from first question to a clear list of fixes.</h2>
        </div>
        <ol className="how__steps">
          {STEPS.map(([title, body], i) => (
            <li key={title} className="how__step">
              <span className="how__num">{String(i + 1).padStart(2, '0')}</span>
              <h3>{title}</h3>
              <p className="muted">{body}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="privacy" id="privacy" aria-labelledby="privacy-title">
        <div className="privacy__head">
          <p className="eyebrow">Privacy</p>
          <h2 id="privacy-title">Practice in private. Your camera feed never reaches an AI.</h2>
        </div>
        <ul className="privacy__list">
          {PRIVACY.map(([title, body]) => (
            <li key={title}>
              <strong>{title}</strong>
              <span className="muted">{body}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="start" id="start">
        <div className="start__text">
          <p className="eyebrow">Start</p>
          <h2>Your first session is a sign-in away.</h2>
          <p className="muted">Five questions, about fifteen minutes, and a report you can come back to.</p>
        </div>
        <AuthForm />
      </section>

      <footer className="site-footer">
        <span className="brand brand--small">
          <BrandMark size={18} />
          <span>Kemo AI</span>
        </span>
        <span className="muted">Practice out loud. Only you can see your recordings.</span>
      </footer>
    </div>
  )
}
