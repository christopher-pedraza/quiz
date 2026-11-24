import type { GradeResult, Question } from '../model/types.ts'
import type { ExamConfig } from './sample.ts'

export interface Bucket {
  earned: number
  possible: number
  count: number
}

export interface ExamScore {
  earned: number
  possible: number
  /** 0..100; 0 when nothing is gradable yet. */
  percent: number
  byTopic: Record<string, Bucket>
  byType: Record<string, Bucket>
  /** short-answer questions still waiting for the learner to self-grade (not in `possible` yet). */
  pending: number
  unanswered: number
}

export interface ExamResult extends ExamScore {
  id: string
  /** epoch ms */
  at: number
  config: ExamConfig
  seconds: number
  /** Per question: the fraction scored, null while ungraded. */
  scores: { id: string; score: number | null }[]
}

const bump = (m: Record<string, Bucket>, key: string, earned: number, possible: number) => {
  const b = (m[key] ??= { earned: 0, possible: 0, count: 0 })
  b.earned += earned
  b.possible += possible
  b.count++
}

/** Points-weighted score. A missing grade is an unanswered question (0 points earned); an ungraded one is pending. */
export function scoreExam(questions: readonly Question[], grades: Readonly<Record<string, GradeResult | undefined>>): ExamScore {
  const out: ExamScore = { earned: 0, possible: 0, percent: 0, byTopic: {}, byType: {}, pending: 0, unanswered: 0 }
  for (const q of questions) {
    const g = grades[q.id]
    const pts = q.points ?? 1
    if (g && !g.graded) {
      out.pending++
      continue
    }
    if (!g) out.unanswered++
    const earned = g ? g.score * pts : 0
    out.earned += earned
    out.possible += pts
    bump(out.byTopic, q.topic, earned, pts)
    bump(out.byType, q.type, earned, pts)
  }
  out.percent = out.possible > 0 ? (out.earned / out.possible) * 100 : 0
  return out
}
