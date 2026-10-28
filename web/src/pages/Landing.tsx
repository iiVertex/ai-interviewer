import { useState, type CSSProperties, type FormEvent, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
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

const stagger = (i: number) => ({ '--i': i }) as CSSProperties

/** A blurred, chromatic portrait inside a face-tracking ring: the camera's view of you. */
function HeroVisual() {
  return (
    <div className="hero-visual" aria-hidden="true">
      <span className="hero-visual__glow" />
      <span className="hero-visual__streak" />
      <svg className="hero-visual__figure" viewBox="0 0 600 600" preserveAspectRatio="xMidYMax meet">
        <defs>
          <filter id="hv-soft" x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation="16" />
          </filter>
          <filter id="hv-softer" x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation="26" />
          </filter>
          <g id="hv-bust">
            <ellipse cx="300" cy="235" rx="92" ry="114" />
            <path d="M262 330h76l10 70h-96Z" />
            <path d="M110 640c10-150 90-232 190-232s180 82 190 232Z" />
          </g>
        </defs>
        <use href="#hv-bust" className="hero-visual__fringe hero-visual__fringe--warm" filter="url(#hv-softer)" x="-16" />
        <use href="#hv-bust" className="hero-visual__fringe hero-visual__fringe--cool" filter="url(#hv-softer)" x="18" />
        <use href="#hv-bust" className="hero-visual__bust" filter="url(#hv-soft)" />
        <g className="hero-visual__ring">
          <circle cx="300" cy="235" r="168" strokeDasharray="1 7" />
          <path d="M300 59v14M300 397v14M124 235h14M462 235h14" />
        </g>
        <g className="hero-visual__marks">
          <path d="M256 222h12M262 216v12M332 222h12M338 216v12M294 292h12M300 286v12" />
        </g>
      </svg>
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

  return (
    <div className="site">
      <div className="site-top">
        <HeroVisual />
        <header className="topbar topbar--site">
          <Link to="/" className="brand">
            <BrandMark />
            <span>Interview Coach</span>
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

      <section className="start" id="start">
        <div className="start__text">
          <p className="eyebrow">Start</p>
          <h2>Your first session is a sign-in away.</h2>
          <p className="muted" id="privacy">
            Face and posture analysis runs in your browser, and no AI ever sees your video. Your recordings are stored
            privately so you can replay them, and deleting a session deletes everything saved for it.
          </p>
        </div>
        <AuthForm />
      </section>

      <footer className="site-footer">
        <span className="brand brand--small">
          <BrandMark size={18} />
          <span>Interview Coach</span>
        </span>
        <span className="muted">Practice out loud. Only you can see your recordings.</span>
      </footer>
    </div>
  )
}
