import { useEffect, useRef, type RefObject } from 'react'

export type OrbState = 'idle' | 'speaking' | 'thinking' | 'listening'

type Wave = { born: number; amp: number; lobes: number; phase: number; strength: number }

const TAU = Math.PI * 2
const WAVE_MS = 1900 // how long a wave takes to travel from the ring to the edge
const RING = 0.2 // ring radius as a share of the canvas width
const EDGE = 0.48

const easeOut = (t: number) => 1 - (1 - t) ** 3

function readColors(el: Element) {
  const css = getComputedStyle(el)
  const v = (name: string) => css.getPropertyValue(name).trim()
  return { text: v('--text'), accent: v('--accent'), iris: ['--iris-amber', '--iris-rose', '--iris-violet', '--iris-sky'].map(v) }
}

/** A circle, slightly wavy for a live wave, at radius r. */
function ring(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, amp = 0, lobes = 0, phase = 0) {
  ctx.beginPath()
  const steps = amp > 0.05 ? 120 : 64
  for (let i = 0; i <= steps; i++) {
    const a = (i / steps) * TAU
    const rr = r + amp * Math.sin(lobes * a + phase)
    if (i === 0) ctx.moveTo(cx + rr * Math.cos(a), cy + rr * Math.sin(a))
    else ctx.lineTo(cx + rr * Math.cos(a), cy + rr * Math.sin(a))
  }
  ctx.stroke()
}

/**
 * The interviewer: a hollow ring that sends out sound waves while someone is talking.
 * Iridescent when the interviewer speaks, accent-colored when it's listening to you,
 * a slow pulse while you think. Waves follow whatever level is in `levelRef` (0..1).
 */
export function VoiceOrb({ levelRef, state }: { levelRef: RefObject<number>; state: OrbState }) {
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
    const waves: Wave[] = []
    let colors = readColors(canvas)
    let size = 0
    let raf = 0
    let frame = 0
    let smooth = 0
    let pending = 0
    let last = performance.now()

    const resize = () => {
      const dpr = window.devicePixelRatio || 1
      size = canvas.clientWidth
      canvas.width = Math.round(size * dpr)
      canvas.height = Math.round(size * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    const observer = new ResizeObserver(resize)
    observer.observe(canvas)
    resize()

    const draw = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now
      smooth += ((levelRef.current ?? 0) - smooth) * 0.18
      if (frame++ % 30 === 0) colors = readColors(canvas) // follows theme changes
      const s = stateRef.current
      const c = size / 2
      const r0 = size * RING
      const r1 = size * EDGE

      // Louder speech sends waves out faster and stronger; thinking keeps a slow, faint pulse.
      const talking = (s === 'speaking' || s === 'listening') && smooth > 0.035
      const rate = s === 'thinking' ? 0.55 : talking ? 1.1 + smooth * 4.5 : 0
      pending += dt * rate
      while (pending >= 1) {
        pending -= 1
        waves.push({
          born: now,
          amp: s === 'thinking' ? 0 : 1.5 + smooth * size * 0.035,
          lobes: 3 + Math.floor(Math.random() * 4),
          phase: Math.random() * TAU,
          strength: s === 'thinking' ? 0.22 : 0.3 + smooth * 0.7,
        })
      }

      ctx.clearRect(0, 0, size, size)
      if (s === 'speaking') {
        const g = ctx.createConicGradient(now / 2600, c, c)
        colors.iris.forEach((col, i) => g.addColorStop(i / colors.iris.length, col))
        g.addColorStop(1, colors.iris[0])
        ctx.strokeStyle = g
      } else {
        ctx.strokeStyle = s === 'listening' ? colors.accent : colors.text
      }
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'

      if (reduce) {
        // No travelling waves: three still rings brighten with the level instead.
        for (let i = 1; i <= 3; i++) {
          ctx.globalAlpha = (talking ? 0.15 + smooth * 0.6 : 0.12) * (1 - (i - 1) * 0.28)
          ctx.lineWidth = 1.25
          ring(ctx, c, c, r0 + ((r1 - r0) * i) / 3.4)
        }
        waves.length = 0
      } else {
        for (let i = waves.length - 1; i >= 0; i--) {
          const w = waves[i]
          const t = (now - w.born) / WAVE_MS
          if (t >= 1) {
            waves.splice(i, 1)
            continue
          }
          ctx.globalAlpha = w.strength * (1 - t) ** 1.6
          ctx.lineWidth = 0.75 + 1.5 * (1 - t)
          // The wave starts at the ring and smooths out as it spreads.
          ring(ctx, c, c, r0 + (r1 - r0) * easeOut(t), w.amp * (1 - t), w.lobes, w.phase + t * 3)
        }
      }

      // The ring itself: hollow, a touch thicker and wider while there's sound.
      const breathe = s === 'thinking' && !reduce ? Math.sin(now / 520) * 0.025 : 0
      ctx.globalAlpha = s === 'idle' ? 0.5 : 0.95
      ctx.lineWidth = 2 + smooth * 2.5
      ring(ctx, c, c, r0 * (1 + smooth * 0.07 + breathe))
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
    <div className={`orb orb--${state}`} aria-hidden="true">
      <canvas ref={canvasRef} className="orb__canvas" />
    </div>
  )
}
