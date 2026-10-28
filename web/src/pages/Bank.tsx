import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Layout } from '../components/Layout'
import { ApiError, api } from '../lib/api'
import { scoreTone } from '../lib/format'
import { supabase } from '../lib/supabase'
import { MODE_LABELS, type Mode, type SavedQuestion } from '../lib/types'

const MAX_PICK = 5

/** The session takes the mode most of the picked questions came from, so the rubric fits. */
function commonMode(picked: SavedQuestion[]): Mode {
  const counts = new Map<Mode, number>()
  picked.forEach((q) => counts.set(q.mode, (counts.get(q.mode) ?? 0) + 1))
  return [...counts].sort((a, b) => b[1] - a[1])[0][0]
}

export default function Bank() {
  const navigate = useNavigate()
  const [saved, setSaved] = useState<SavedQuestion[] | null>(null)
  const [picked, setPicked] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    supabase
      .from('saved_questions')
      .select('*')
      .order('created_at', { ascending: false })
      .then(({ data, error }) => {
        if (error) setError(error.message)
        else setSaved(data as SavedQuestion[])
      })
  }, [])

  const toggle = (id: string) =>
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : p.length < MAX_PICK ? [...p, id] : p))

  const remove = async (id: string) => {
    const { error } = await supabase.from('saved_questions').delete().eq('id', id)
    if (error) return setError(error.message)
    setSaved((s) => s && s.filter((q) => q.id !== id))
    setPicked((p) => p.filter((x) => x !== id))
  }

  const practice = async () => {
    if (!saved || !picked.length) return
    setBusy(true)
    setError(null)
    const chosen = picked.map((id) => saved.find((q) => q.id === id)!)
    try {
      const { id, questions } = await api.createSession(commonMode(chosen), {}, picked)
      navigate(`/session/${id}`, { state: { questions } })
    } catch (err) {
      if (err instanceof ApiError && err.status === 403) navigate('/consent')
      else setError((err as Error).message)
      setBusy(false)
    }
  }

  return (
    <Layout>
      <section className="home-head">
        <div>
          <p className="eyebrow">Practice bank</p>
          <h1>Questions to try again</h1>
          <p className="muted">Pick up to {MAX_PICK} and run them as a session. Your replay gets a fresh report.</p>
        </div>
        <button className="btn btn--primary btn--lg" onClick={practice} disabled={!picked.length || busy}>
          {busy ? 'Preparing…' : picked.length ? `Practice ${picked.length} question${picked.length > 1 ? 's' : ''}` : 'Pick questions to practice'}
        </button>
      </section>

      {error && <p className="error">{error}</p>}

      {saved === null ? (
        !error && <div className="spinner" />
      ) : saved.length === 0 ? (
        <div className="card empty">
          <p>Nothing saved yet. On any report, open a question and press <strong>Save to practice bank</strong>.</p>
        </div>
      ) : (
        <ul className="bank">
          {saved.map((q) => {
            const on = picked.includes(q.id)
            const full = !on && picked.length >= MAX_PICK
            return (
              <li key={q.id} className={on ? 'bank__item bank__item--on' : 'bank__item'}>
                <label className="bank__pick">
                  <input type="checkbox" checked={on} disabled={full} onChange={() => toggle(q.id)} />
                  <span className="bank__box" aria-hidden="true">{on ? picked.indexOf(q.id) + 1 : ''}</span>
                  <span className="bank__main">
                    <strong>{q.text}</strong>
                    <span className="muted">
                      {MODE_LABELS[q.mode]}
                      {q.role ? ` · ${q.role}` : ''}
                      {' · saved '}
                      {new Date(q.created_at).toLocaleDateString(undefined, { dateStyle: 'medium' })}
                    </span>
                  </span>
                </label>
                {q.score != null && (
                  <span className={`score-pill score-pill--${scoreTone(q.score)}`} title="Content score when you saved it">{q.score}</span>
                )}
                <span className="bank__actions">
                  {q.session_id && <Link to={`/report/${q.session_id}`} className="btn btn--ghost btn--sm">Report</Link>}
                  <button className="btn btn--danger btn--sm" onClick={() => remove(q.id)} aria-label={`Remove “${q.text}” from the bank`}>
                    Remove
                  </button>
                </span>
              </li>
            )
          })}
        </ul>
      )}
    </Layout>
  )
}
