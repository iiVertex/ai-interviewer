import { scoreTone } from '../lib/format'

export function ScoreRing({ value, size = 120, label }: { value: number | null | undefined; size?: number; label?: string }) {
  const stroke = Math.max(6, size / 12)
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const pct = value == null ? 0 : Math.max(0, Math.min(100, value)) / 100
  return (
    <div className={`ring ring--${scoreTone(value)}`} style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`${label ?? 'Score'}: ${value ?? 'not available'}`}>
        <circle className="ring__track" cx={size / 2} cy={size / 2} r={r} strokeWidth={stroke} fill="none" />
        <circle
          className="ring__value"
          cx={size / 2}
          cy={size / 2}
          r={r}
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={`${c * pct} ${c}`}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      <div className="ring__label">
        <span className="ring__number" style={{ fontSize: size / 3.4 }}>{value ?? '–'}</span>
        {label && <span className="ring__caption">{label}</span>}
      </div>
    </div>
  )
}
