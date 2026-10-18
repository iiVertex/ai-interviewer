import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Layout } from '../components/Layout'
import { api } from '../lib/api'
import { scoreTone } from '../lib/format'
import { supabase } from '../lib/supabase'
import { MODE_LABELS, type Me, type SessionRow } from '../lib/types'

type HistoryRow = Pick<SessionRow, 'id' | 'mode' | 'config' | 'status' | 'scores' | 'created_at'>

export default function Home() {
  const navigate = useNavigate()
  const [me, setMe] = useState<Me | null>(null)
  const [history, setHistory] = useState<HistoryRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api.me().then(setMe).catch((e) => setError(e.message))
    supabase
      .from('sessions')
      .select('id, mode, config, status, scores, created_at')
      .order('created_at', { ascending: false })
      .limit(50)
      .then(({ data, error }) => {
        if (error) setError(error.message)
        else setHistory(data as HistoryRow[])
      })
  }, [])

  const left = me ? Math.max(0, me.daily_limit - me.used_today) : null
  const start = () => navigate(me && !me.consented ? '/consent' : '/new')

  return (
    <Layout>
      <section className="home-head">
        <div>
          <h1>Ready to practice?</h1>
          <p className="muted">
            {left === null ? ' ' : `${left} of ${me!.daily_limit} sessions left in the next 24 hours.`}
          </p>
        </div>
        <button className="btn btn--primary btn--lg" onClick={start} disabled={left === 0}>
          Start a practice session
        </button>
      </section>

      {error && <p className="error">{error}</p>}

      <section>
        <h2>Your sessions</h2>
        {history === null ? (
          <div className="spinner" />
        ) : history.length === 0 ? (
          <div className="card empty">
            <p>No sessions yet. Your first report will show up here.</p>
          </div>
        ) : (
          <ul className="history">
            {history.map((s) => {
              const overall = s.scores?.overall ?? null
              return (
                <li key={s.id}>
                  <Link to={`/report/${s.id}`} className="history__row">
                    <span className={`score-pill score-pill--${scoreTone(overall)}`}>{overall ?? '–'}</span>
                    <span className="history__main">
                      <strong>{MODE_LABELS[s.mode]}</strong>
                      <span className="muted">
                        {s.config.role ? `${s.config.role} · ` : ''}
                        {new Date(s.created_at).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}
                      </span>
                    </span>
                    <span className={`status status--${s.status}`}>{s.status === 'ready' ? 'Report ready' : s.status === 'created' ? 'Unfinished' : 'Processing'}</span>
                  </Link>
                </li>
              )
            })}
          </ul>
        )}
      </section>
    </Layout>
  )
}
