import type { OrderingQuestion } from '../model/types.ts'
import { makeRng, shuffled } from '../random.ts'
import { result, warn, type CheckIssue, type TypeModule } from './api.ts'

export interface OrderingInstance {
  type: 'ordering'
  seed: number
  question: OrderingQuestion
  /** Initial display order: indexes into question.items (never the solved order). */
  display: number[]
}
export type OrderingAnswer = { type: 'ordering'; order: number[] }

function instantiate(q: OrderingQuestion, seed: number): OrderingInstance {
  const rng = makeRng(seed)
  const n = q.items.length
  const solved = Array.from({ length: n }, (_, i) => i)
  let display = shuffled(solved, rng)
  for (let tries = 0; tries < 10 && display.every((v, i) => v === i); tries++) display = shuffled(solved, rng)
  if (display.every((v, i) => v === i)) display = [...solved.slice(1), solved[0]]
  return { type: 'ordering', seed, question: q, display }
}

const isPermutation = (order: readonly number[], n: number) =>
  order.length === n && new Set(order).size === n && order.every((v) => Number.isInteger(v) && v >= 0 && v < n)

function grade(inst: OrderingInstance, ans: OrderingAnswer) {
  const n = inst.question.items.length
  if (!isPermutation(ans.order, n)) return result(0, { invalid: true })
  const inPlace = ans.order.map((v, i) => v === i)
  if (inst.question.grading === 'partial') {
    let ok = 0
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) if (ans.order[i] < ans.order[j]) ok++
    return result(ok / ((n * (n - 1)) / 2), { inPlace })
  }
  return result(inPlace.every(Boolean) ? 1 : 0, { inPlace })
}

function check(q: OrderingQuestion): CheckIssue[] {
  const dup = q.items.find((t, i) => q.items.indexOf(t) !== i)
  return dup === undefined ? [] : [warn('/items', `duplicate item ${JSON.stringify(dup)}`, 'learners cannot tell identical items apart')]
}

export const ordering: TypeModule<OrderingQuestion, OrderingInstance, OrderingAnswer> = {
  instantiate,
  grade,
  check,
  emptyAnswer: (inst) => ({ type: 'ordering', order: inst.display.slice() }),
}
