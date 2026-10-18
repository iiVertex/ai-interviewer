import type { LevelMeter } from '../audio/level'
import type { Thumbnail } from '../lib/recordings'
import type { FrameFeatures, VisionEngine } from './engine'

export type Tick = { features: FrameFeatures; level: number; now: number }

export type Calibration = Partial<Record<'yaw' | 'pitch' | 'gaze_h' | 'gaze_v' | 'neck' | 'tilt' | 'face_w', number>>

export type SignalPayload = {
  version: 1
  fps: number
  duration_s: number
  calibration: Calibration
  frames: Record<string, (number | null)[]>
}

const FRAME_KEYS: (keyof FrameFeatures)[] = [
  'face', 'yaw', 'pitch', 'roll', 'gaze_h', 'gaze_v', 'blink', 'smile', 'brow', 'cheek', 'mouth',
  'face_cx', 'face_cy', 'face_w', 'light', 'pose', 'neck', 'tilt', 'motion',
]

const round = (v: number | null | undefined) => (v == null || !Number.isFinite(v) ? null : Math.round(v * 1000) / 1000)

/** Runs MediaPipe on the live video about 10 times a second and fans the result out. */
export class CaptureLoop {
  private raf = 0
  private last = 0
  private listeners = new Set<(tick: Tick) => void>()
  private engine: VisionEngine
  private video: HTMLVideoElement
  private meter: LevelMeter
  private intervalMs: number

  constructor(engine: VisionEngine, video: HTMLVideoElement, meter: LevelMeter, intervalMs = 100) {
    this.engine = engine
    this.video = video
    this.meter = meter
    this.intervalMs = intervalMs
  }

  start() {
    const loop = (now: number) => {
      this.raf = requestAnimationFrame(loop)
      if (now - this.last < this.intervalMs || this.video.readyState < 2) return
      this.last = now
      const tick = { features: this.engine.analyze(this.video, now), level: this.meter.level(), now }
      this.listeners.forEach((fn) => fn(tick))
    }
    this.raf = requestAnimationFrame(loop)
  }

  subscribe(fn: (tick: Tick) => void): () => void {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }

  stop() {
    cancelAnimationFrame(this.raf)
    this.listeners.clear()
  }
}

/** Collects one answer's frames (as columns) and a low-res thumbnail every half second. */
export class SignalRecorder {
  private t: number[] = []
  private cols: Record<string, (number | null)[]> = Object.fromEntries([...FRAME_KEYS, 'level'].map((k) => [k, []]))
  private thumbs: Thumbnail[] = []
  private lastThumb = -Infinity
  private canvas = document.createElement('canvas')
  private ctx: CanvasRenderingContext2D
  private readonly startNow: number
  private video: HTMLVideoElement
  private calibration: Calibration

  constructor(video: HTMLVideoElement, calibration: Calibration, startNow: number) {
    this.video = video
    this.calibration = calibration
    this.startNow = startNow
    this.canvas.width = 480
    this.canvas.height = Math.round((480 * (video.videoHeight || 9)) / (video.videoWidth || 16))
    this.ctx = this.canvas.getContext('2d')!
  }

  push(tick: Tick) {
    const t = (tick.now - this.startNow) / 1000
    if (t < 0) return
    this.t.push(Math.round(t * 1000) / 1000)
    for (const key of FRAME_KEYS) this.cols[key].push(round(tick.features[key]))
    this.cols.level.push(round(tick.level))
    if (t - this.lastThumb >= 0.5) {
      this.lastThumb = t
      this.ctx.drawImage(this.video, 0, 0, this.canvas.width, this.canvas.height)
      this.canvas.toBlob((blob) => blob && this.thumbs.push({ t, blob }), 'image/jpeg', 0.75)
    }
  }

  finish(endNow: number): { payload: SignalPayload; thumbnails: Thumbnail[] } {
    const duration = Math.max(0, (endNow - this.startNow) / 1000)
    return {
      payload: {
        version: 1,
        fps: this.t.length / Math.max(duration, 0.001),
        duration_s: Math.round(duration * 10) / 10,
        calibration: this.calibration,
        frames: { t: this.t, ...this.cols },
      },
      thumbnails: this.thumbs,
    }
  }
}

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b)
  return s.length ? s[Math.floor(s.length / 2)] : undefined
}

/** Baseline pose and gaze from ticks recorded while the user looked at the camera. */
export function calibrate(ticks: Tick[]): { calibration: Calibration; faceShare: number } {
  const withFace = ticks.filter((t) => t.features.face === 1)
  const pick = (k: keyof FrameFeatures) =>
    median(withFace.map((t) => t.features[k]).filter((v): v is number => typeof v === 'number' && Number.isFinite(v)))
  const calibration: Calibration = {}
  for (const k of ['yaw', 'pitch', 'gaze_h', 'gaze_v', 'neck', 'tilt', 'face_w'] as const) {
    const v = pick(k)
    if (v !== undefined) calibration[k] = round(v) ?? undefined
  }
  return { calibration, faceShare: ticks.length ? withFace.length / ticks.length : 0 }
}
