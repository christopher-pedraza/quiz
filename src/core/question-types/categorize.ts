import type { CategorizeQuestion } from '../model/types.ts'
import { makeRng, shuffled } from '../random.ts'
import { err, result, type CheckIssue, type TypeModule } from './api.ts'

export interface CategorizeInstance {
  type: 'categorize'
  seed: number
  question: CategorizeQuestion
  /** All chips (items + distractors), shuffled. */
  pool: string[]
}
export type CategorizeAnswer = { type: 'categorize'; placed: Record<string, string | null> }

function grade(inst: CategorizeInstance, ans: CategorizeAnswer) {
  const q = inst.question
  const items: Record<string, boolean> = {}
  let right = 0
  let total = 0
  for (const c of q.categories)
    for (const item of c.items) {
      total++
      const ok = ans.placed[item] === c.id
      items[item] = ok
      if (ok) right++
    }
  const distractorsPlaced = (q.distractors ?? []).filter((d) => ans.placed[d] != null)
  const penalty = (q.distractorPenalty ?? 0) * distractorsPlaced.length
  return result((right - penalty) / total, { items, distractorsPlaced })
}

function check(q: CategorizeQuestion): CheckIssue[] {
  const out: CheckIssue[] = []
  const owner = new Map<string, string>()
  const catIds = new Set<string>()
  q.categories.forEach((c, i) => {
    if (catIds.has(c.id)) out.push(err(`/categories/${i}/id`, `duplicate category id "${c.id}"`))
    catIds.add(c.id)
    c.items.forEach((item, j) => {
      const prev = owner.get(item)
      if (prev) out.push(err(`/categories/${i}/items/${j}`, `item ${JSON.stringify(item)} is already in "${prev}"`, 'chips are identified by their text, so each must be unique'))
      owner.set(item, c.title)
    })
  })
  q.distractors?.forEach((d, i) => {
    if (owner.has(d)) out.push(err(`/distractors/${i}`, `distractor ${JSON.stringify(d)} is also an item of "${owner.get(d)}"`))
  })
  return out
}

export const categorize: TypeModule<CategorizeQuestion, CategorizeInstance, CategorizeAnswer> = {
  instantiate: (q, seed) => ({
    type: 'categorize',
    seed,
    question: q,
    pool: shuffled([...q.categories.flatMap((c) => c.items), ...(q.distractors ?? [])], makeRng(seed)),
  }),
  grade,
  check,
  emptyAnswer: () => ({ type: 'categorize', placed: {} }),
}
