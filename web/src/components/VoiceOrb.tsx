import { useEffect, useRef, type RefObject } from 'react'

export type OrbState = 'idle' | 'speaking' | 'thinking' | 'listening'

/** The interviewer: a soft orb that swells with whatever level is in `levelRef` (0..1). */
export function VoiceOrb({ levelRef, state }: { levelRef: RefObject<number>; state: OrbState }) {
  const core = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    let raf = 0
    let smooth = 0
    const loop = () => {
      smooth += ((levelRef.current ?? 0) - smooth) * 0.2
      const el = core.current
      if (el) {
        el.style.setProperty('--level', smooth.toFixed(3))
        if (reduce) el.style.opacity = (0.75 + smooth * 0.25).toFixed(3)
        else el.style.transform = `scale(${(1 + smooth * 0.32).toFixed(3)})`
      }
      raf = requestAnimationFrame(loop)
    }
    loop()
    return () => cancelAnimationFrame(raf)
  }, [levelRef])

  return (
    <div className={`orb orb--${state}`} aria-hidden="true">
      <div ref={core} className="orb__core" />
    </div>
  )
}
