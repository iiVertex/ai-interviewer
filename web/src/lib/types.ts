export type Mode = 'job' | 'student' | 'communication'

export type SessionConfig = {
  role?: string
  seniority?: 'intern' | 'junior' | 'mid' | 'senior'
  job_description?: string
  student_type?: 'internship' | 'college' | 'scholarship'
  source?: 'bank'
}

export type Question = { id: string; text: string }

export type Category = 'eye_contact' | 'expressiveness' | 'composure' | 'delivery' | 'content'
export type Scores = Partial<Record<Category | 'overall', number | null>>

export type Flag = {
  id: string
  kind: 'issue' | 'highlight'
  answer_idx: number
  signal: string
  category: Category | 'framing' | 'highlight'
  label: string
  start_s: number
  end_s: number
  worst_s: number
  severity: number
  message: string
  tip: string
  screenshot: boolean
  excerpt: string | null
}

export type RubricItem = { criterion: string; score: number; comment: string }
export type AnswerFeedback = {
  index: number
  score: number
  rubric: RubricItem[]
  worked: string[]
  missing: string[]
  stronger_answer: string
}
export type ContentReport = {
  answers: AnswerFeedback[]
  summary: string
  top_fixes: { title: string; detail: string }[]
}

export type SessionRow = {
  id: string
  user_id: string
  mode: Mode
  config: SessionConfig
  questions: Question[]
  status: 'created' | 'processing' | 'ready' | 'failed'
  flags: Flag[]
  scores: Scores | null
  content: ContentReport | null
  error: string | null
  created_at: string
  completed_at: string | null
}

export type TranscriptWord = { w: string; s: number; e: number; f?: 1 }

export type AnswerRow = {
  session_id: string
  idx: number
  question: string
  duration_s: number
  transcript: { text: string; words: TranscriptWord[] } | null
  metrics: Record<string, number | null>
  scores: Scores
  timeline: { eye_contact: (number | null)[]; speaking: (number | null)[] } | null
}

export type SavedQuestion = {
  id: string
  text: string
  mode: Mode
  role: string | null
  session_id: string | null
  answer_idx: number | null
  score: number | null
  created_at: string
}

export type Me = { id: string; email: string | null; consented: boolean; daily_limit: number; used_today: number }

export const MODE_LABELS: Record<Mode, string> = {
  job: 'Job interview',
  student: 'Student interview',
  communication: 'Communication practice',
}

export const CATEGORY_LABELS: Record<Category, string> = {
  eye_contact: 'Eye contact',
  expressiveness: 'Expressiveness',
  composure: 'Posture & composure',
  delivery: 'Delivery',
  content: 'Content',
}
