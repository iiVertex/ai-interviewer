/** Microphone loudness (RMS, 0..1) from a Web Audio analyser. */
export class LevelMeter {
  private analyser: AnalyserNode
  private buffer: Float32Array<ArrayBuffer>

  constructor(ctx: AudioContext, stream: MediaStream) {
    const source = ctx.createMediaStreamSource(stream)
    this.analyser = ctx.createAnalyser()
    this.analyser.fftSize = 1024
    this.buffer = new Float32Array(this.analyser.fftSize)
    source.connect(this.analyser)
  }

  level(): number {
    this.analyser.getFloatTimeDomainData(this.buffer)
    let sum = 0
    for (const v of this.buffer) sum += v * v
    return Math.sqrt(sum / this.buffer.length)
  }
}
