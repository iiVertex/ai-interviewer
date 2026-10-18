// Recordings live only in this tab's memory: video never leaves the user's computer.
// The report page uses them for replay right after a session; after a reload they're gone.

export type Thumbnail = { t: number; blob: Blob }

export type AnswerRecording = {
  video: Blob
  videoUrl: string
  thumbnails: Thumbnail[]
}

const store = new Map<string, Map<number, AnswerRecording>>()

export function saveRecording(sessionId: string, idx: number, video: Blob, thumbnails: Thumbnail[]) {
  if (!store.has(sessionId)) store.set(sessionId, new Map())
  store.get(sessionId)!.set(idx, { video, videoUrl: URL.createObjectURL(video), thumbnails })
}

export function getRecording(sessionId: string, idx: number): AnswerRecording | undefined {
  return store.get(sessionId)?.get(idx)
}

export function hasRecordings(sessionId: string): boolean {
  return (store.get(sessionId)?.size ?? 0) > 0
}

export function nearestThumbnail(sessionId: string, idx: number, t: number): Blob | undefined {
  const thumbs = getRecording(sessionId, idx)?.thumbnails
  if (!thumbs?.length) return undefined
  let best = thumbs[0]
  for (const th of thumbs) if (Math.abs(th.t - t) < Math.abs(best.t - t)) best = th
  return best.blob
}

export function forgetRecordings(sessionId: string) {
  store.get(sessionId)?.forEach((r) => URL.revokeObjectURL(r.videoUrl))
  store.delete(sessionId)
}
