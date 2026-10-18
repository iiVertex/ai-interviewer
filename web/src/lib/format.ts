export function formatTime(seconds: number): string {
  const s = Math.max(0, Math.round(seconds))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

export function scoreTone(value: number | null | undefined): 'good' | 'ok' | 'low' | 'none' {
  if (value == null) return 'none'
  if (value >= 75) return 'good'
  if (value >= 50) return 'ok'
  return 'low'
}
