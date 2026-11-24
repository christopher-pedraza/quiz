import type { Answer, GradeResult, Question } from '../../core/model/types.ts'
import type { ExamResult } from '../../core/exam/score.ts'
import { emptyAnswer, grade, type Instance } from '../../core/question-types/index.ts'
import { scoreExam } from '../../core/exam/score.ts'

/** Everything the results screen needs about a finished exam (answers are kept in memory only). */
export interface ExamOutcome {
  result: ExamResult
  questions: Question[]
  instances: Record<string, Instance>
  answers: Record<string, Answer>
  /** Questions the learner never touched. */
  unanswered: string[]
  flags: string[]
}

/** Has the learner changed anything from the blank state? */
export const isAnswered = (inst: Instance, a: Answer | undefined): boolean => a !== undefined && JSON.stringify(a) !== JSON.stringify(emptyAnswer(inst))

/** Grades only answered questions: a missing grade counts as unanswered in scoreExam. */
export function gradeAll(questions: readonly Question[], instances: Record<string, Instance>, answers: Record<string, Answer>) {
  const grades: Record<string, GradeResult | undefined> = {}
  for (const q of questions) grades[q.id] = isAnswered(instances[q.id], answers[q.id]) ? grade(instances[q.id], answers[q.id]) : undefined
  return { grades, score: scoreExam(questions, grades) }
}

export const scoresOf = (questions: readonly Question[], grades: Record<string, GradeResult | undefined>) =>
  questions.map((q) => ({ id: q.id, score: grades[q.id] ? (grades[q.id]!.graded ? grades[q.id]!.score : null) : 0 }))
