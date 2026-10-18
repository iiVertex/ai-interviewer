/**
 * Re-encodes a MediaRecorder clip as 16 kHz mono 16-bit WAV. CometAPI reads the audio's duration
 * before transcribing and can't parse webm, so answers are uploaded as WAV (about 32 kB per second).
 * maxSeconds keeps a full 2-minute answer under the server's 4 MB upload limit.
 */
export async function toWav(clip: Blob, sampleRate = 16000, maxSeconds = 124): Promise<Blob> {
  // decodeAudioData resamples to the context's rate, so this decodes and downsamples in one step.
  const ctx = new OfflineAudioContext(1, 1, sampleRate)
  const audio = await ctx.decodeAudioData(await clip.arrayBuffer())
  const n = Math.min(audio.length, maxSeconds * sampleRate)

  const mono = new Float32Array(n)
  for (let c = 0; c < audio.numberOfChannels; c++) {
    const data = audio.getChannelData(c)
    for (let i = 0; i < n; i++) mono[i] += data[i] / audio.numberOfChannels
  }

  const view = new DataView(new ArrayBuffer(44 + n * 2))
  const text = (offset: number, s: string) => [...s].forEach((ch, i) => view.setUint8(offset + i, ch.charCodeAt(0)))
  text(0, 'RIFF')
  view.setUint32(4, 36 + n * 2, true)
  text(8, 'WAVE')
  text(12, 'fmt ')
  view.setUint32(16, 16, true) // fmt chunk size
  view.setUint16(20, 1, true) // PCM
  view.setUint16(22, 1, true) // mono
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * 2, true) // bytes per second
  view.setUint16(32, 2, true) // bytes per frame
  view.setUint16(34, 16, true) // bits per sample
  text(36, 'data')
  view.setUint32(40, n * 2, true)
  for (let i = 0; i < n; i++) {
    const s = Math.max(-1, Math.min(1, mono[i]))
    view.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true)
  }
  return new Blob([view], { type: 'audio/wav' })
}
