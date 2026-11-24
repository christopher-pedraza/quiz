import type { ExamResult } from '../exam/score.ts'
import type { SourceSpec } from '../source/types.ts'

/** The subset of Storage we use (so tests and private-mode fallbacks can supply their own). */
export interface KV {
  getItem(k: string): string | null
  setItem(k: string, v: string): void
  removeItem(k: string): void
}

const PREFIX = 'quiz:v1:'
export const MAX_EXAMS = 50
export const MAX_RECENT = 20

export interface Attempt {
  /** Score of the last graded attempt, 0..1. */
  score: number
  best: number
  attempts: number
  at: number
  seed?: number
  /** The last submission awaits self-grading (short-answer). */
  pending?: boolean
}

export type Status = 'unanswered' | 'correct' | 'incorrect' | 'pending'
export const statusOf = (a: Attempt | undefined): Status => (!a ? 'unanswered' : a.pending ? 'pending' : a.score >= 1 - 1e-9 ? 'correct' : 'incorrect')

export interface RecentEntry {
  slug: string
  source: SourceSpec | { kind: 'local'; name: string }
  title: string
  openedAt: number
}

function read<T>(kv: KV, key: string, fallback: T, ok: (v: unknown) => boolean): T {
  try {
    const raw = kv.getItem(key)
    if (raw === null) return fallback
    const v: unknown = JSON.parse(raw)
    return ok(v) ? (v as T) : fallback
  } catch {
    return fallback
  }
}
function write(kv: KV, key: string, value: unknown): boolean {
  try {
    kv.setItem(key, JSON.stringify(value))
    return true
  } catch {
    return false // quota exceeded / storage disabled: the app keeps working, progress just isn't saved
  }
}
const isObj = (v: unknown) => v !== null && typeof v === 'object' && !Array.isArray(v)

/** Everything saved for ONE quiz, under quiz:v1:{slug}:… */
export class QuizStore {
  private readonly kv: KV
  readonly slug: string
  constructor(kv: KV, slug: string) {
    this.kv = kv
    this.slug = slug
  }
  private key(name: string) {
    return `${PREFIX}${this.slug}:${name}`
  }

  attempts(): Record<string, Attempt> {
    return read(this.kv, this.key('attempts'), {}, isObj)
  }
  recordAttempt(id: string, score: number, opts: { seed?: number; pending?: boolean; at?: number } = {}): Attempt {
    const all = this.attempts()
    const prev = all[id]
    const a: Attempt = {
      score,
      best: opts.pending ? (prev?.best ?? 0) : Math.max(prev?.best ?? 0, score),
      attempts: (prev?.attempts ?? 0) + 1,
      at: opts.at ?? Date.now(),
      ...(opts.seed !== undefined && { seed: opts.seed }),
      ...(opts.pending && { pending: true }),
    }
    all[id] = a
    write(this.kv, this.key('attempts'), all)
    return a
  }
  clearAttempts() {
    this.kv.removeItem(this.key('attempts'))
  }
  /** Forget the result of one question only. */
  clearAttempt(id: string) {
    const all = this.attempts()
    if (id in all) {
      delete all[id]
      write(this.kv, this.key('attempts'), all)
    }
  }
  clearFlags() {
    this.kv.removeItem(this.key('flags'))
  }
  clearExams() {
    this.kv.removeItem(this.key('exams'))
  }

  flags(): Set<string> {
    return new Set(read<string[]>(this.kv, this.key('flags'), [], (v) => Array.isArray(v) && v.every((x) => typeof x === 'string')))
  }
  /** Returns the new state. */
  toggleFlag(id: string): boolean {
    const f = this.flags()
    const now = !f.has(id)
    if (now) f.add(id)
    else f.delete(id)
    write(this.kv, this.key('flags'), [...f])
    return now
  }

  exams(): ExamResult[] {
    return read<ExamResult[]>(this.kv, this.key('exams'), [], Array.isArray)
  }
  addExam(r: ExamResult) {
    write(this.kv, this.key('exams'), [r, ...this.exams()].slice(0, MAX_EXAMS))
  }

  /** Replaces a saved exam (same id), e.g. after the learner self-graded a short answer. */
  updateExam(r: ExamResult) {
    write(this.kv, this.key('exams'), this.exams().map((e) => (e.id === r.id ? r : e)))
  }

  ui<T extends object>(fallback: T): T {
    return { ...fallback, ...read<Partial<T>>(this.kv, this.key('ui'), {}, isObj) }
  }
  setUi(v: object) {
    write(this.kv, this.key('ui'), v)
  }
}

/** Cross-quiz state: the recent list. */
export class AppStore {
  private readonly kv: KV
  constructor(kv: KV) {
    this.kv = kv
  }
  recent(): RecentEntry[] {
    return read<RecentEntry[]>(this.kv, `${PREFIX}_recent`, [], (v) => Array.isArray(v) && v.every((e) => isObj(e) && typeof (e as RecentEntry).slug === 'string'))
  }
  pushRecent(e: RecentEntry) {
    write(this.kv, `${PREFIX}_recent`, [e, ...this.recent().filter((x) => x.slug !== e.slug)].slice(0, MAX_RECENT))
  }
  removeRecent(slug: string) {
    write(this.kv, `${PREFIX}_recent`, this.recent().filter((x) => x.slug !== slug))
  }
}
