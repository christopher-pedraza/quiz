import type { ShortAnswerQuestion } from '../model/types.ts'
import { result, type TypeModule } from './api.ts'

export interface ShortAnswerInstance {
  type: 'short-answer'
  seed: number
  question: ShortAnswerQuestion
}
export type ShortAnswerAnswer = { type: 'short-answer'; text: string; checked: number[]; selfGraded: boolean }

export const shortAnswer: TypeModule<ShortAnswerQuestion, ShortAnswerInstance, ShortAnswerAnswer> = {
  instantiate: (q, seed) => ({ type: 'short-answer', seed, question: q }),
  grade(inst, ans) {
    if (!ans.selfGraded) return result(0, {}, false)
    const pts = inst.question.rubric.map((r) => r.points ?? 1)
    const total = pts.reduce((a, b) => a + b, 0)
    const got = [...new Set(ans.checked)].reduce((s, i) => s + (pts[i] ?? 0), 0)
    return result(got / total, { checked: ans.checked })
  },
  check: () => [],
  emptyAnswer: () => ({ type: 'short-answer', text: '', checked: [], selfGraded: false }),
}
