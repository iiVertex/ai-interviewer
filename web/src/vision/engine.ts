import {
  FaceLandmarker,
  FilesetResolver,
  PoseLandmarker,
  type Category,
  type NormalizedLandmark,
} from '@mediapipe/tasks-vision'

// Wasm is copied from node_modules into public/ by scripts/copy-mediapipe.mjs.
const WASM_BASE = '/mediapipe/wasm'
const FACE_MODEL =
  'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task'
const POSE_MODEL =
  'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task'

/** One video frame reduced to the numbers the server analyses. Null = not measurable. */
export type FrameFeatures = {
  face: 0 | 1
  yaw: number | null
  pitch: number | null
  roll: number | null
  gaze_h: number | null
  gaze_v: number | null
  blink: number | null
  smile: number | null
  brow: number | null
  cheek: number | null
  mouth: number | null
  face_cx: number | null
  face_cy: number | null
  face_w: number | null
  light: number | null
  pose: 0 | 1
  neck: number | null
  tilt: number | null
  motion: number | null
}

const DEG = 180 / Math.PI
const NOSE = 0
const L_SHOULDER = 11
const R_SHOULDER = 12
const L_WRIST = 15
const R_WRIST = 16

function blendshapeMap(categories: Category[]): Record<string, number> {
  const out: Record<string, number> = {}
  for (const c of categories) out[c.categoryName] = c.score
  return out
}

/** Yaw/pitch/roll in degrees from MediaPipe's 4x4 facial transformation matrix (column-major). */
function headAngles(m: number[]): { yaw: number; pitch: number; roll: number } {
  const r02 = m[8], r12 = m[9], r22 = m[10], r10 = m[1], r11 = m[5]
  return {
    yaw: Math.atan2(r02, r22) * DEG,
    pitch: Math.asin(Math.max(-1, Math.min(1, -r12))) * DEG,
    roll: Math.atan2(r10, r11) * DEG,
  }
}

const visible = (p: NormalizedLandmark | undefined) => !!p && (p.visibility ?? 0) > 0.5

export class VisionEngine {
  private lastTs = -1
  private prevPoints: { x: number; y: number }[] | null = null
  private prevT = 0
  private lightCtx: CanvasRenderingContext2D
  private faceLandmarker: FaceLandmarker
  private poseLandmarker: PoseLandmarker

  private constructor(faceLandmarker: FaceLandmarker, poseLandmarker: PoseLandmarker) {
    this.faceLandmarker = faceLandmarker
    this.poseLandmarker = poseLandmarker
    const canvas = document.createElement('canvas')
    canvas.width = 32
    canvas.height = 18
    this.lightCtx = canvas.getContext('2d', { willReadFrequently: true })!
  }

  static async create(): Promise<VisionEngine> {
    const fileset = await FilesetResolver.forVisionTasks(WASM_BASE)
    const build = (delegate: 'GPU' | 'CPU') =>
      Promise.all([
        FaceLandmarker.createFromOptions(fileset, {
          baseOptions: { modelAssetPath: FACE_MODEL, delegate },
          runningMode: 'VIDEO',
          numFaces: 1,
          outputFaceBlendshapes: true,
          outputFacialTransformationMatrixes: true,
        }),
        PoseLandmarker.createFromOptions(fileset, {
          baseOptions: { modelAssetPath: POSE_MODEL, delegate },
          runningMode: 'VIDEO',
          numPoses: 1,
        }),
      ])
    try {
      const [face, pose] = await build('GPU')
      return new VisionEngine(face, pose)
    } catch {
      const [face, pose] = await build('CPU')
      return new VisionEngine(face, pose)
    }
  }

  analyze(video: HTMLVideoElement, nowMs: number): FrameFeatures {
    const ts = Math.max(Math.round(nowMs), this.lastTs + 1) // MediaPipe needs increasing timestamps
    this.lastTs = ts
    const aspect = video.videoWidth / Math.max(1, video.videoHeight)
    const out: FrameFeatures = {
      face: 0, yaw: null, pitch: null, roll: null, gaze_h: null, gaze_v: null, blink: null,
      smile: null, brow: null, cheek: null, mouth: null, face_cx: null, face_cy: null, face_w: null,
      light: this.brightness(video), pose: 0, neck: null, tilt: null, motion: null,
    }

    const face = this.faceLandmarker.detectForVideo(video, ts)
    const landmarks = face.faceLandmarks[0]
    if (landmarks?.length) {
      out.face = 1
      let minX = 1, maxX = 0, minY = 1, maxY = 0
      for (const p of landmarks) {
        minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x)
        minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y)
      }
      out.face_cx = (minX + maxX) / 2
      out.face_cy = (minY + maxY) / 2
      out.face_w = maxX - minX

      const b = blendshapeMap(face.faceBlendshapes[0]?.categories ?? [])
      const g = (k: string) => b[k] ?? 0
      out.smile = (g('mouthSmileLeft') + g('mouthSmileRight')) / 2
      out.brow = (g('browInnerUp') + g('browOuterUpLeft') + g('browOuterUpRight')) / 3
      out.cheek = (g('cheekSquintLeft') + g('cheekSquintRight')) / 2
      out.mouth = g('jawOpen')
      out.blink = (g('eyeBlinkLeft') + g('eyeBlinkRight')) / 2
      // Positive = looking toward the subject's right / up.
      out.gaze_h = (g('eyeLookInLeft') - g('eyeLookOutLeft') + g('eyeLookOutRight') - g('eyeLookInRight')) / 2
      out.gaze_v = (g('eyeLookUpLeft') + g('eyeLookUpRight') - g('eyeLookDownLeft') - g('eyeLookDownRight')) / 2

      const matrix = face.facialTransformationMatrixes[0]?.data
      if (matrix?.length === 16) Object.assign(out, headAngles(matrix))
    }

    const pose = this.poseLandmarker.detectForVideo(video, ts)
    const lm = pose.landmarks[0]
    if (lm && visible(lm[L_SHOULDER]) && visible(lm[R_SHOULDER])) {
      out.pose = 1
      const P = (i: number) => ({ x: lm[i].x * aspect, y: lm[i].y }) // square units
      const ls = P(L_SHOULDER), rs = P(R_SHOULDER), nose = P(NOSE)
      const width = Math.hypot(ls.x - rs.x, ls.y - rs.y)
      if (width > 0.01) {
        out.neck = ((ls.y + rs.y) / 2 - nose.y) / width
        out.tilt = Math.atan2(ls.y - rs.y, ls.x - rs.x) * DEG
        const points = [nose, ls, rs, visible(lm[L_WRIST]) ? P(L_WRIST) : null, visible(lm[R_WRIST]) ? P(R_WRIST) : null]
        const dt = (nowMs - this.prevT) / 1000
        if (this.prevPoints && dt > 0 && dt < 1) {
          let sum = 0, count = 0
          points.forEach((p, i) => {
            const prev = this.prevPoints![i]
            if (p && prev && Number.isFinite(prev.x)) {
              sum += Math.hypot(p.x - prev.x, p.y - prev.y)
              count++
            }
          })
          if (count) out.motion = sum / count / width / dt
        }
        this.prevPoints = points.map((p) => p ?? { x: NaN, y: NaN })
        this.prevT = nowMs
      }
    }
    return out
  }

  private brightness(video: HTMLVideoElement): number | null {
    try {
      this.lightCtx.drawImage(video, 0, 0, 32, 18)
      const { data } = this.lightCtx.getImageData(0, 0, 32, 18)
      let sum = 0
      for (let i = 0; i < data.length; i += 4) sum += 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]
      return sum / (data.length / 4) / 255
    } catch {
      return null
    }
  }

  close() {
    this.faceLandmarker.close()
    this.poseLandmarker.close()
  }
}
