import { useEffect, useRef, type RefObject } from 'react'

export type WaveState = 'idle' | 'speaking' | 'thinking' | 'listening'

const BAR = 4 // bar width, px
const GAP = 3
const SAMPLE_MS = 55 // a new bar enters on the right this often
const MIN_H = 3 // silence still shows as a row of dots

function readColors(el: Element) {
  const css = getComputedStyle(el)
  const v = (name: string) => css.getPropertyValue(name).trim()
  return { text: v('--text'), accent: v('--accent'), iris: ['--iris-amber', '--iris-rose', '--iris-violet', '--iris-sky'].map(v) }
}

/**
 * The interviewer: a live audio waveform. Bars scroll in from the right, mirrored around the
 * middle, following whatever level is in `levelRef` (0..1). Iridescent while the interviewer
 * speaks, accent-colored while it listens to you, a slow ripple while you think.
 */
export function VoiceWave({ levelRef, state }: { levelRef: RefObject<number>; state: WaveState }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const stateRef = useRef(state)
  useEffect(() => {
    stateRef.current = state
  }, [state])

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    let colors = readColors(canvas)
    let w = 0
    let h = 0
    let bars: number[] = []
    let raf = 0
    let frame = 0
    let smooth = 0
    let lastSample = performance.now()

    const resize = () => {
      const dpr = window.devicePixelRatio || 1
      w = canvas.clientWidth
      h = canvas.clientHeight
      canvas.width = Math.round(w * dpr)
      canvas.height = Math.round(h * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      const n = Math.ceil(w / (BAR + GAP)) + 1
      bars = Array.from({ length: n }, (_, i) => bars[bars.length - n + i] ?? 0)
    }
    const observer = new ResizeObserver(resize)
    observer.observe(canvas)
    resize()

    const sample = (now: number, s: WaveState) => {
      if (s === 'thinking') return 0.05 + 0.05 * (1 + Math.sin(now / 260)) // a soft travelling ripple
      if (s === 'idle') return 0
      // Real speech is spiky; a little jitter keeps the smoothed level from looking like a hill.
      return Math.min(1, smooth * 1.4) ** 0.8 * (0.55 + Math.random() * 0.45)
    }

    const draw = (now: number) => {
      smooth += ((levelRef.current ?? 0) - smooth) * 0.3
      if (frame++ % 30 === 0) colors = readColors(canvas) // follows theme changes
      const s = stateRef.current
      const step = BAR + GAP
      const mid = h / 2

      let shift = 0
      if (!reduce) {
        while (now - lastSample >= SAMPLE_MS) {
          lastSample += SAMPLE_MS
          bars.shift()
          bars.push(sample(lastSample, s))
        }
        shift = ((now - lastSample) / SAMPLE_MS) * step // glide between samples instead of ticking
      }

      ctx.clearRect(0, 0, w, h)
      if (s === 'speaking') {
        const g = ctx.createLinearGradient(0, 0, w, 0)
        colors.iris.forEach((col, i) => g.addColorStop(i / (colors.iris.length - 1), col))
        ctx.fillStyle = g
      } else {
        ctx.fillStyle = s === 'listening' ? colors.accent : colors.text
      }

      const n = bars.length
      for (let i = 0; i < n; i++) {
        const x = i * step - shift
        if (x + BAR < 0 || x > w) continue
        // Reduced motion: bars stay put and one bell-shaped envelope follows the level.
        const amp = reduce ? sample(now, s) * Math.exp(-(((i / (n - 1)) * 2 - 1) ** 2) * 3) : bars[i]
        const bh = Math.max(MIN_H, amp * (h - 4))
        // Fade both ends so the wave reads as passing through, not boxed in.
        const edge = Math.min(x, w - x - BAR) / (w * 0.16)
        ctx.globalAlpha = Math.max(0, Math.min(1, edge)) * (s === 'thinking' || s === 'idle' ? 0.4 : 1)
        ctx.beginPath()
        ctx.roundRect(x, mid - bh / 2, BAR, bh, BAR / 2)
        ctx.fill()
      }
      ctx.globalAlpha = 1
      raf = requestAnimationFrame(draw)
    }
    raf = requestAnimationFrame(draw)
    return () => {
      cancelAnimationFrame(raf)
      observer.disconnect()
    }
  }, [levelRef])

  return (
    <div className={`wave wave--${state}`} aria-hidden="true">
      <canvas ref={canvasRef} className="wave__canvas" />
    </div>
  )
}
