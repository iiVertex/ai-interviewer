import { supabase } from './supabase'
import type { Flag, Me, Mode, Question, Scores, SessionConfig } from './types'

export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const { data } = await supabase.auth.getSession()
  const headers = new Headers(init.headers)
  if (data.session) headers.set('Authorization', `Bearer ${data.session.access_token}`)
  if (init.body && !(init.body instanceof FormData)) headers.set('Content-Type', 'application/json')
  const res = await fetch(path, { ...init, headers })
  if (!res.ok) {
    let message = res.statusText
    try {
      const body = await res.json()
      message = typeof body.detail === 'string' ? body.detail : message
    } catch {
      /* not JSON */
    }
    throw new ApiError(res.status, message)
  }
  return res.json() as Promise<T>
}

export const api = {
  me: () => request<Me>('/api/me'),
  consent: () => request<{ ok: true }>('/api/consent', { method: 'POST' }),
  createSession: (mode: Mode, config: SessionConfig) =>
    request<{ id: string; questions: Question[] }>('/api/sessions', {
      method: 'POST',
      body: JSON.stringify({ mode, config }),
    }),
  questionAudio: (sid: string, idx: number) =>
    request<{ url: string; text: string }>(`/api/sessions/${sid}/questions/${idx}/audio`, { method: 'POST' }),
  uploadAnswer: (sid: string, idx: number, audio: Blob, signals: object) => {
    const form = new FormData()
    form.append('audio', audio, 'answer.webm')
    form.append('signals', new Blob([JSON.stringify(signals)], { type: 'application/json' }), 'signals.json')
    return request<{ ok: true; word_timestamps: boolean }>(`/api/sessions/${sid}/answers/${idx}`, {
      method: 'POST',
      body: form,
    })
  },
  analyze: (sid: string) =>
    request<{ flags: Flag[]; scores: Scores }>(`/api/sessions/${sid}/analyze`, { method: 'POST' }),
  score: (sid: string) =>
    request<{ ok: true; content_error: string | null }>(`/api/sessions/${sid}/score`, { method: 'POST' }),
  deleteSession: (sid: string) => request<{ ok: true }>(`/api/sessions/${sid}`, { method: 'DELETE' }),
}
