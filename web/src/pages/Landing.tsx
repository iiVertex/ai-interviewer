import { useState, type FormEvent } from 'react'
import { Layout } from '../components/Layout'
import { useAuth } from '../lib/auth'

const FEATURES = [
  ['Eye contact', 'See exactly when your gaze drifted away from the camera, and for how long.'],
  ['Expression & posture', 'Spot flat stretches, slouching and fidgeting, with a screenshot of the moment.'],
  ['Delivery', 'Speaking pace, filler words and long pauses, placed on a timeline of your answers.'],
  ['Answer quality', 'Feedback on structure, relevance and examples, plus a sketch of a stronger answer.'],
]

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
    <form className="card auth-card" onSubmit={submit}>
      <label className="field">
        Email
        <input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
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
      <button className="btn btn--primary" type="submit" disabled={busy}>
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
  return (
    <Layout>
      <section className="hero">
        <p className="eyebrow">Practice interviews · Instant feedback</p>
        <h1>Rehearse with an AI interviewer. See exactly what to fix.</h1>
        <p className="lead">
          Answer real interview questions on camera. When you finish, you get a timeline of the moments that
          worked and the ones that didn't, with screenshots and one concrete fix for each.
        </p>
        <AuthForm />
        <p className="muted small">Your video stays on your computer. Only transcripts, scores and a few screenshots are saved.</p>
      </section>
      <section className="feature-grid">
        {FEATURES.map(([title, body]) => (
          <div key={title} className="card feature">
            <h3>{title}</h3>
            <p>{body}</p>
          </div>
        ))}
      </section>
    </Layout>
  )
}
