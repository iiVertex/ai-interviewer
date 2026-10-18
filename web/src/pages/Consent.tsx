import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Layout } from '../components/Layout'
import { api } from '../lib/api'

export default function Consent() {
  const navigate = useNavigate()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const accept = async () => {
    setBusy(true)
    setError(null)
    try {
      await api.consent()
      navigate('/new', { replace: true })
    } catch (e) {
      setError((e as Error).message)
      setBusy(false)
    }
  }

  return (
    <Layout>
      <div className="card consent">
        <h1>Before your first session</h1>
        <p className="lead">Here's what happens to your camera and microphone data.</p>
        <ul className="checklist">
          <li><strong>Your video never leaves your computer.</strong> Face and posture analysis runs in your browser while you record.</li>
          <li><strong>Your voice is transcribed.</strong> Each answer's audio is sent to a speech-to-text service, then discarded.</li>
          <li><strong>An AI reviews your answers.</strong> Only the transcripts (not audio or video) are sent to an AI model for feedback.</li>
          <li><strong>What we save:</strong> transcripts, scores, the measured signals and a few screenshots of flagged moments.</li>
          <li><strong>You're in control.</strong> Delete any session at any time and everything saved for it goes with it.</li>
        </ul>
        {error && <p className="error">{error}</p>}
        <div className="actions">
          <button className="btn btn--primary btn--lg" onClick={accept} disabled={busy}>
            {busy ? 'Saving…' : 'I understand, continue'}
          </button>
        </div>
      </div>
    </Layout>
  )
}
