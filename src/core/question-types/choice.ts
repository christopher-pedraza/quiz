import type { McqQuestion, MultiSelectQuestion } from '../model/types.ts'
import { makeRng, shuffled } from '../random.ts'
import { err, result, warn, type CheckIssue, type TypeModule } from './api.ts'

export interface McqInstance {
  type: 'mcq'
  seed: number
  question: McqQuestion
  /** Display order as indexes into question.options. Answers always use ORIGINAL indexes. */
  order: number[]
}
export interface MultiSelectInstance {
  type: 'multi-select'
  seed: number
  question: MultiSelectQuestion
  order: number[]
}
export type McqAnswer = { type: 'mcq'; picked: number | null }
export type MultiSelectAnswer = { type: 'multi-select'; picked: number[] }

const orderOf = (n: number, shuffle: boolean | undefined, seed: number) =>
  shuffle ? shuffled(Array.from({ length: n }, (_, i) => i), makeRng(seed)) : Array.from({ length: n }, (_, i) => i)

function checkOptions(q: McqQuestion | MultiSelectQuestion, exactlyOne: boolean): CheckIssue[] {
  const out: CheckIssue[] = []
  const n = q.options.filter((o) => o.correct).length
  if (exactlyOne && n !== 1) out.push(err('/options', `an mcq needs exactly one correct option, found ${n}`, n > 1 ? 'use "multi-select" for several correct options' : undefined))
  if (!exactlyOne && n < 1) out.push(err('/options', 'a multi-select needs at least one correct option'))
  const seen = new Set<string>()
  q.options.forEach((o, i) => {
    if (seen.has(o.text)) out.push(warn(`/options/${i}/text`, `duplicate option text ${JSON.stringify(o.text)}`))
    seen.add(o.text)
  })
  return out
}

export const mcq: TypeModule<McqQuestion, McqInstance, McqAnswer> = {
  instantiate: (q, seed) => ({ type: 'mcq', seed, question: q, order: orderOf(q.options.length, q.shuffle, seed) }),
  grade(inst, ans) {
    const idx = inst.question.options.findIndex((o) => o.correct)
    return result(ans.picked === idx ? 1 : 0, { picked: ans.picked, correctIndex: idx })
  },
  check: (q) => checkOptions(q, true),
  emptyAnswer: () => ({ type: 'mcq', picked: null }),
}

export const multiSelect: TypeModule<MultiSelectQuestion, MultiSelectInstance, MultiSelectAnswer> = {
  instantiate: (q, seed) => ({ type: 'multi-select', seed, question: q, order: orderOf(q.options.length, q.shuffle, seed) }),
  grade(inst, ans) {
    const picked = new Set(ans.picked)
    let right = 0
    let wrong = 0
    let missed = 0
    inst.question.options.forEach((o, i) => {
      if (picked.has(i) && o.correct) right++
      else if (picked.has(i)) wrong++
      else if (o.correct) missed++
    })
    const total = right + missed
    const score = inst.question.grading === 'partial' ? Math.max(0, (right - wrong) / total) : wrong === 0 && missed === 0 ? 1 : 0
    return result(score, { right, wrong, missed })
  },
  check: (q) => checkOptions(q, false),
  emptyAnswer: () => ({ type: 'multi-select', picked: [] }),
}
