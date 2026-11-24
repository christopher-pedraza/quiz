import type { Difficulty, Question, QuestionType } from '../model/types.ts'
import { deriveSeed, makeRng, shuffled } from '../random.ts'

export interface ExamConfig {
  count: number
  /** Minutes; the UI auto-submits on expiry. Undefined = untimed. */
  minutes?: number
  topics?: string[]
  types?: QuestionType[]
  difficulties?: Difficulty[]
  /** Percent per topic id. Topics without an entry share the remainder equally. */
  weights?: Record<string, number>
  /** Drives question choice, order, and (via deriveSeed per question) numbers and shuffles. */
  seed: number
  /** Mix topics in the final order (default true); false groups by topic in manifest order. */
  shuffle?: boolean
}

export interface TopicAllocation {
  /** Questions available after the filters. */
  available: number
  /** Share of the exam this topic should get, 0..1 after normalization. */
  share: number
  /** Questions actually drawn. */
  got: number
}

export interface SampledExam {
  ids: string[]
  allocation: Record<string, TopicAllocation>
  warnings: string[]
}

/**
 * Largest-remainder apportionment of `n` seats by `weights`, never exceeding `caps`.
 * Quotas are computed once over the topics that are still free; a topic whose quota exceeds its cap is fixed at the cap and
 * the rest is re-apportioned among the others, so a shortfall flows to topics with room in proportion to their weights.
 * Topics with weight 0 only receive seats when every weighted topic is already full.
 */
export function apportion(order: string[], weights: Record<string, number>, caps: Record<string, number>, n: number): Record<string, number> {
  const alloc: Record<string, number> = Object.fromEntries(order.map((t) => [t, 0]))
  const fixed = new Set<string>()
  for (;;) {
    const free = order.filter((t) => !fixed.has(t))
    const left = n - [...fixed].reduce((s, t) => s + alloc[t], 0)
    if (free.length === 0 || left <= 0) break
    const w = (t: string) => weights[t] ?? 0
    const equal = free.every((t) => w(t) <= 0) // only zero-weight topics remain: they share equally
    const total = free.reduce((s, t) => s + (equal ? 1 : w(t)), 0)
    const quota = Object.fromEntries(free.map((t) => [t, ((equal ? 1 : w(t)) / total) * left]))
    const over = free.filter((t) => quota[t] > caps[t] + 1e-9)
    if (over.length > 0) {
      for (const t of over) {
        alloc[t] = caps[t]
        fixed.add(t)
      }
      continue
    }
    for (const t of free) alloc[t] = Math.floor(quota[t] + 1e-9)
    let rest = left - free.reduce((s, t) => s + alloc[t], 0)
    const byFraction = [...free].sort((x, y) => quota[y] - Math.floor(quota[y] + 1e-9) - (quota[x] - Math.floor(quota[x] + 1e-9)) || order.indexOf(x) - order.indexOf(y))
    for (const t of byFraction) {
      if (rest <= 0) break
      if (alloc[t] < caps[t]) {
        alloc[t]++
        rest--
      }
    }
    break
  }
  return alloc
}

export function sampleExam(questions: readonly Question[], topicOrder: readonly string[], cfg: ExamConfig): SampledExam {
  const warnings: string[] = []
  const pool = questions.filter(
    (q) =>
      (!cfg.topics?.length || cfg.topics.includes(q.topic)) &&
      (!cfg.types?.length || cfg.types.includes(q.type)) &&
      (!cfg.difficulties?.length || (q.difficulty !== undefined && cfg.difficulties.includes(q.difficulty))),
  )
  const byTopic = new Map<string, Question[]>()
  for (const q of pool) byTopic.set(q.topic, [...(byTopic.get(q.topic) ?? []), q])
  const order = topicOrder.filter((t) => byTopic.has(t))
  const caps = Object.fromEntries(order.map((t) => [t, byTopic.get(t)!.length]))

  const requested = Math.max(0, Math.floor(cfg.count))
  const count = Math.min(requested, pool.length)
  if (count < requested) warnings.push(`only ${pool.length} question(s) match the filters; the exam has ${count} instead of ${requested}`)
  if (count === 0) return { ids: [], allocation: {}, warnings: [...warnings, 'no questions match the filters'] }

  // Percent weights. No weights at all: every question equally likely (weight ∝ pool size).
  const given = Object.entries(cfg.weights ?? {}).filter(([, w]) => Number.isFinite(w) && w >= 0)
  const weights: Record<string, number> = {}
  for (const [t, w] of given) {
    if (order.includes(t)) weights[t] = w
    else if (topicOrder.includes(t) && w > 0) warnings.push(`topic "${t}" has a weight but no questions match the filters`)
  }
  if (Object.keys(weights).length === 0) {
    for (const t of order) weights[t] = caps[t]
  } else {
    const unset = order.filter((t) => !(t in weights))
    const rest = Math.max(0, 100 - Object.values(weights).reduce((a, b) => a + b, 0))
    for (const t of unset) weights[t] = rest / unset.length
    if (Object.values(weights).every((w) => w === 0)) for (const t of order) weights[t] = 1
  }
  const total = Object.values(weights).reduce((a, b) => a + b, 0)
  const share = Object.fromEntries(order.map((t) => [t, weights[t] / total]))

  const alloc = apportion(order, weights, caps, count)
  const allocation: Record<string, TopicAllocation> = {}
  const picked: Record<string, string[]> = {}
  for (const t of order) {
    picked[t] = shuffled(byTopic.get(t)!, makeRng(deriveSeed(cfg.seed, 'pick', t)))
      .slice(0, alloc[t])
      .map((q) => q.id)
    allocation[t] = { available: caps[t], share: share[t], got: alloc[t] }
    const want = share[t] * count
    if (alloc[t] + 1 < want - 1e-9 && alloc[t] === caps[t]) warnings.push(`topic "${t}" has only ${caps[t]} matching question(s) but its weight asks for about ${Math.round(want)}; the rest went to other topics`)
  }
  const ids = order.flatMap((t) => picked[t])
  return { ids: cfg.shuffle === false ? ids : shuffled(ids, makeRng(deriveSeed(cfg.seed, 'order'))), allocation, warnings }
}
