export type Speech = { done: Promise<void>; stop: () => void }

/**
 * Plays the interviewer's question and reports its loudness so the orb can pulse.
 * Falls back to the browser's built-in voice if the audio can't be fetched or decoded.
 */
export function speak(ctx: AudioContext, url: string | null, text: string, onLevel: (level: number) => void): Speech {
  let stopped = false
  let stopCurrent = () => {}
  const stop = () => {
    stopped = true
    stopCurrent()
  }

  const playAudio = async (src: string) => {
    const res = await fetch(src)
    if (!res.ok) throw new Error(`audio ${res.status}`)
    const buffer = await ctx.decodeAudioData(await res.arrayBuffer())
    if (stopped) return
    const source = ctx.createBufferSource()
    const analyser = ctx.createAnalyser()
    analyser.fftSize = 512
    source.buffer = buffer
    source.connect(analyser)
    analyser.connect(ctx.destination)
    const data = new Float32Array(analyser.fftSize)
    let raf = 0
    const tick = () => {
      analyser.getFloatTimeDomainData(data)
      let sum = 0
      for (const v of data) sum += v * v
      onLevel(Math.min(1, Math.sqrt(sum / data.length) * 4))
      raf = requestAnimationFrame(tick)
    }
    await new Promise<void>((resolve) => {
      source.onended = () => resolve()
      stopCurrent = () => {
        try {
          source.stop()
        } catch {
          /* already stopped */
        }
        resolve()
      }
      source.start()
      tick()
    })
    cancelAnimationFrame(raf)
    onLevel(0)
  }

  const playSynth = () =>
    new Promise<void>((resolve) => {
      if (!('speechSynthesis' in window)) {
        setTimeout(resolve, 1500)
        return
      }
      const utterance = new SpeechSynthesisUtterance(text)
      utterance.rate = 0.98
      let raf = 0
      const start = performance.now()
      const pulse = () => {
        // No audio data to analyse here, so fake a gentle speaking rhythm.
        const t = (performance.now() - start) / 1000
        onLevel(0.35 + 0.25 * Math.abs(Math.sin(t * 6.3)) * Math.abs(Math.sin(t * 1.7)))
        raf = requestAnimationFrame(pulse)
      }
      const finish = () => {
        cancelAnimationFrame(raf)
        onLevel(0)
        resolve()
      }
      utterance.onend = finish
      utterance.onerror = finish
      stopCurrent = () => {
        window.speechSynthesis.cancel()
        finish()
      }
      window.speechSynthesis.cancel()
      window.speechSynthesis.speak(utterance)
      pulse()
    })

  const done = (async () => {
    if (url) {
      try {
        await playAudio(url)
        return
      } catch {
        if (stopped) return
      }
    }
    if (!stopped) await playSynth()
  })()

  return { done, stop }
}
