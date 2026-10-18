import type { Flag } from '../lib/types'
import { formatTime } from '../lib/format'

export function FlagCard({
  flag,
  screenshotUrl,
  onReplay,
}: {
  flag: Flag
  screenshotUrl?: string
  onReplay?: () => void
}) {
  const highlight = flag.kind === 'highlight'
  return (
    <article id={`flag-${flag.id}`} className={`flag-card ${highlight ? 'flag-card--highlight' : ''}`}>
      {screenshotUrl ? (
        <div className="flag-card__media">
          <img src={screenshotUrl} alt={`You at ${formatTime(flag.worst_s)} in answer ${flag.answer_idx + 1}`} loading="lazy" />
        </div>
      ) : flag.excerpt ? (
        <blockquote className="flag-card__excerpt">“{flag.excerpt}”</blockquote>
      ) : null}
      <div className="flag-card__body">
        <div className="flag-card__meta">
          <span className={`chip cat--${flag.category}`}>{flag.label}</span>
          <span className="muted">
            Q{flag.answer_idx + 1} · {formatTime(flag.start_s)}–{formatTime(flag.end_s)}
          </span>
        </div>
        <p className="flag-card__message">{flag.message}</p>
        <p className="flag-card__tip">
          <strong>{highlight ? 'Keep it up: ' : 'Try this: '}</strong>
          {flag.tip}
        </p>
        {onReplay && (
          <button className="btn btn--ghost btn--sm" onClick={onReplay}>
            Replay this moment
          </button>
        )}
      </div>
    </article>
  )
}
