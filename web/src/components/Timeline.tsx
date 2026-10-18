import type { Flag } from '../lib/types'

/** All answers side by side, sized by length, with a marker for every flag. */
export function Timeline({
  durations,
  flags,
  onSelect,
}: {
  durations: number[]
  flags: Flag[]
  onSelect: (flag: Flag) => void
}) {
  const total = durations.reduce((a, b) => a + Math.max(b, 1), 0) || 1
  return (
    <div className="timeline">
      <div className="timeline__track">
        {durations.map((d, idx) => {
          const share = (Math.max(d, 1) / total) * 100
          const own = flags.filter((f) => f.answer_idx === idx)
          return (
            <div key={idx} className="timeline__segment" style={{ width: `${share}%` }}>
              <span className="timeline__label">Q{idx + 1}</span>
              {own.map((f) => {
                const left = Math.min(98, (f.start_s / Math.max(d, 1)) * 100)
                const width = Math.max(2, ((f.end_s - f.start_s) / Math.max(d, 1)) * 100)
                return (
                  <button
                    key={f.id}
                    className={`timeline__mark cat--${f.category}`}
                    style={{ left: `${left}%`, width: `${Math.min(width, 100 - left)}%` }}
                    title={`${f.label}: ${f.message}`}
                    aria-label={`Question ${idx + 1}, ${f.label}`}
                    onClick={() => onSelect(f)}
                  />
                )
              })}
            </div>
          )
        })}
      </div>
      <div className="timeline__legend">
        {[
          ['eye_contact', 'Eye contact'],
          ['expressiveness', 'Expression'],
          ['composure', 'Composure'],
          ['delivery', 'Delivery'],
          ['framing', 'Framing'],
          ['highlight', 'Strong moment'],
        ].map(([cat, label]) => (
          <span key={cat} className="legend-item">
            <span className={`legend-dot cat--${cat}`} />
            {label}
          </span>
        ))}
      </div>
    </div>
  )
}
