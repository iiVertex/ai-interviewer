import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { Layout } from '../components/Layout'
import { ApiError, api } from '../lib/api'
import { MODE_LABELS, type Mode, type SessionConfig } from '../lib/types'

const MODES: { mode: Mode; blurb: string }[] = [
  { mode: 'job', blurb: 'Behavioral and role-specific questions for a job you want.' },
  { mode: 'student', blurb: 'Internship, college admission or scholarship interviews.' },
  { mode: 'communication', blurb: 'Open speaking prompts to build clarity and confidence.' },
]

export default function NewSession() {
  const navigate = useNavigate()
  const [mode, setMode] = useState<Mode>('job')
  const [config, setConfig] = useState<SessionConfig>({ seniority: 'junior', student_type: 'internship' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const set = <K extends keyof SessionConfig>(key: K, value: SessionConfig[K]) => setConfig((c) => ({ ...c, [key]: value }))

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const payload: SessionConfig =
      mode === 'job'
        ? { role: config.role?.trim() || undefined, seniority: config.seniority, job_description: config.job_description?.trim() || undefined }
        : mode === 'student'
          ? { student_type: config.student_type }
          : {}
    try {
      const { id, questions } = await api.createSession(mode, payload)
      navigate(`/session/${id}`, { state: { questions } })
    } catch (err) {
      if (err instanceof ApiError && err.status === 403) navigate('/consent')
      else setError((err as Error).message)
      setBusy(false)
    }
  }

  return (
    <Layout>
      <form className="new-session" onSubmit={submit}>
        <p className="eyebrow">New session</p>
        <h1>What are you practicing for?</h1>
        <p className="muted">5 questions · up to 2 minutes per answer · about 15 minutes in total</p>

        <fieldset className="mode-grid">
          <legend className="sr-only">Session type</legend>
          {MODES.map(({ mode: m, blurb }, i) => (
            <label key={m} className={`mode-card ${mode === m ? 'mode-card--active' : ''}`}>
              <input type="radio" name="mode" value={m} checked={mode === m} onChange={() => setMode(m)} />
              <span className="mode-card__num" aria-hidden="true">{String(i + 1).padStart(2, '0')}</span>
              <strong>{MODE_LABELS[m]}</strong>
              <span>{blurb}</span>
            </label>
          ))}
        </fieldset>

        {mode === 'job' && (
          <div className="card form-card">
            <div className="field-row">
              <label className="field">
                <span>Role</span>
                <input
                  type="text"
                  placeholder="e.g. Product designer"
                  maxLength={120}
                  value={config.role ?? ''}
                  onChange={(e) => set('role', e.target.value)}
                />
              </label>
              <label className="field">
                <span>Seniority</span>
                <select value={config.seniority} onChange={(e) => set('seniority', e.target.value as SessionConfig['seniority'])}>
                  <option value="intern">Intern</option>
                  <option value="junior">Junior</option>
                  <option value="mid">Mid-level</option>
                  <option value="senior">Senior</option>
                </select>
              </label>
            </div>
            <label className="field">
              <span>Job description <em className="muted">(optional)</em></span>
              <textarea
                rows={6}
                maxLength={12000}
                placeholder="Paste the job posting. Your feedback will refer to what the role asks for."
                value={config.job_description ?? ''}
                onChange={(e) => set('job_description', e.target.value)}
              />
            </label>
          </div>
        )}

        {mode === 'student' && (
          <div className="card form-card">
            <label className="field">
              <span>Interview type</span>
              <select value={config.student_type} onChange={(e) => set('student_type', e.target.value as SessionConfig['student_type'])}>
                <option value="internship">Internship</option>
                <option value="college">College admission</option>
                <option value="scholarship">Scholarship</option>
              </select>
            </label>
          </div>
        )}

        {error && <p className="error">{error}</p>}
        <div className="actions">
          <button className="btn btn--primary btn--lg" type="submit" disabled={busy}>
            {busy ? 'Preparing…' : 'Continue to camera check'}
          </button>
        </div>
      </form>
    </Layout>
  )
}
