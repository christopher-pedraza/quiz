import type { GradeResult } from '../model/types.ts'

/** A problem found by a type's semantic check; the loader adds file / index / id. */
export interface CheckIssue {
  severity: 'error' | 'warning'
  path: string
  message: string
  hint?: string
}

export interface TypeModule<Q, I, A> {
  /** One concrete showing: everything random is a pure function of (question, seed). */
  instantiate(q: Q, seed: number): I
  grade(inst: I, answer: A): GradeResult
  check(q: Q): CheckIssue[]
  /** What the learner has "answered" before touching anything. */
  emptyAnswer(inst: I): A
}

export function result(score: number, detail: Record<string, unknown> = {}, graded = true): GradeResult {
  const s = Math.max(0, Math.min(1, score))
  return { score: s, correct: graded && s >= 1 - 1e-9, graded, detail }
}

export const err = (path: string, message: string, hint?: string): CheckIssue => ({ severity: 'error', path, message, ...(hint && { hint }) })
export const warn = (path: string, message: string, hint?: string): CheckIssue => ({ severity: 'warning', path, message, ...(hint && { hint }) })
