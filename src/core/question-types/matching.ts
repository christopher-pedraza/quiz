import type { MatchingQuestion } from '../model/types.ts'
import { makeRng, shuffled } from '../random.ts'
import { err, result, warn, type CheckIssue, type TypeModule } from './api.ts'

export interface MatchingInstance {
  type: 'matching'
  seed: number
  question: MatchingQuestion
  /** The choices offered for every row (rights may be picked repeatedly): unique rights + distractors, shuffled. */
  rightOptions: string[]
}
export type MatchingAnswer = { type: 'matching'; chosen: (string | null)[] }

function check(q: MatchingQuestion): CheckIssue[] {
  const out: CheckIssue[] = []
  const rights = new Set(q.pairs.map((p) => p.right))
  if (rights.size < 2) out.push(warn('/pairs', 'every pair has the same right-hand side, so there is nothing to match'))
  q.distractors?.forEach((d, i) => {
    if (rights.has(d)) out.push(err(`/distractors/${i}`, `distractor ${JSON.stringify(d)} is also a right-hand side of a pair`))
  })
  const lefts = new Set<string>()
  q.pairs.forEach((p, i) => {
    if (lefts.has(p.left)) out.push(warn(`/pairs/${i}/left`, `duplicate left-hand side ${JSON.stringify(p.left)}`))
    lefts.add(p.left)
  })
  return out
}

export const matching: TypeModule<MatchingQuestion, MatchingInstance, MatchingAnswer> = {
  instantiate: (q, seed) => ({
    type: 'matching',
    seed,
    question: q,
    rightOptions: shuffled([...new Set([...q.pairs.map((p) => p.right), ...(q.distractors ?? [])])], makeRng(seed)),
  }),
  grade(inst, ans) {
    const pairs = inst.question.pairs.map((p, i) => ans.chosen[i] === p.right)
    const right = pairs.filter(Boolean).length
    const score = inst.question.grading === 'all-or-nothing' ? (right === pairs.length ? 1 : 0) : right / pairs.length
    return result(score, { pairs })
  },
  check,
  emptyAnswer: (inst) => ({ type: 'matching', chosen: inst.question.pairs.map(() => null) }),
}
