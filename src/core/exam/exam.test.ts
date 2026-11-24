import { describe, expect, it } from 'vitest'
import type { GradeResult, Question } from '../model/types.ts'
import { apportion, sampleExam } from './sample.ts'
import { scoreExam } from './score.ts'

const mk = (topic: string, n: number, extra: object = {}): Question[] =>
  Array.from({ length: n }, (_, i) => ({ type: 'mcq', id: `${topic}-${i}`, topic, prompt: 'p', options: [], ...extra }) as unknown as Question)
const bank = [...mk('a', 30), ...mk('b', 30), ...mk('c', 30)]
const order = ['a', 'b', 'c']
const counts = (ids: string[]) => ids.reduce<Record<string, number>>((m, id) => ({ ...m, [id[0]]: (m[id[0]] ?? 0) + 1 }), {})

describe('apportion', () => {
  it('rounds with largest remainders and always sums to n', () => {
    expect(apportion(order, { a: 1, b: 1, c: 1 }, { a: 9, b: 9, c: 9 }, 10)).toEqual({ a: 4, b: 3, c: 3 })
    expect(apportion(order, { a: 20, b: 50, c: 30 }, { a: 99, b: 99, c: 99 }, 7)).toEqual({ a: 1, b: 4, c: 2 })
    for (let n = 0; n <= 25; n++) {
      const r = apportion(order, { a: 17, b: 33, c: 50 }, { a: 99, b: 99, c: 99 }, n)
      expect(r.a + r.b + r.c).toBe(n)
    }
  })
  it('is proportional in a single pass: 50% of 10 with three auto topics gives 5 and 2/2/1, not 7 (regression)', () => {
    expect(apportion(['t', 'f', 'r', 'x'], { t: 50 / 3, f: 50, r: 50 / 3, x: 50 / 3 }, { t: 10, f: 14, r: 5, x: 11 }, 10)).toEqual({ t: 2, f: 5, r: 2, x: 1 })
  })
  it('every n gives a total of n and each seat count is within 1 of its exact quota', () => {
    const w = { a: 13, b: 29, c: 8, d: 50 }
    const caps = { a: 99, b: 99, c: 99, d: 99 }
    for (let n = 0; n <= 60; n++) {
      const r = apportion(['a', 'b', 'c', 'd'], w, caps, n)
      expect(Object.values(r).reduce((s, x) => s + x, 0)).toBe(n)
      for (const t of ['a', 'b', 'c', 'd'] as const) expect(Math.abs(r[t] - (w[t] / 100) * n)).toBeLessThan(1)
    }
  })
  it('redistributes what a capped topic cannot supply', () => {
    expect(apportion(order, { a: 50, b: 25, c: 25 }, { a: 2, b: 99, c: 99 }, 10)).toEqual({ a: 2, b: 4, c: 4 })
  })
  it('uses zero-weight topics only as a last resort', () => {
    expect(apportion(order, { a: 100, b: 0, c: 0 }, { a: 3, b: 5, c: 5 }, 6)).toMatchObject({ a: 3 })
    expect(apportion(order, { a: 100, b: 0, c: 0 }, { a: 9, b: 5, c: 5 }, 6)).toEqual({ a: 6, b: 0, c: 0 })
  })
})

describe('sampleExam', () => {
  it('honours percentage weights', () => {
    const r = sampleExam(bank, order, { count: 20, weights: { a: 20, b: 50, c: 30 }, seed: 1 })
    expect(counts(r.ids)).toEqual({ a: 4, b: 10, c: 6 })
    expect(r.warnings).toEqual([])
    expect(r.allocation.b).toMatchObject({ available: 30, got: 10 })
    expect(r.allocation.b.share).toBeCloseTo(0.5)
  })
  it('gives unweighted topics the remainder equally', () => {
    const r = sampleExam(bank, order, { count: 20, weights: { a: 60 }, seed: 1 })
    expect(counts(r.ids)).toEqual({ a: 12, b: 4, c: 4 })
  })
  it('normalizes weights that do not sum to 100', () => {
    expect(counts(sampleExam(bank, order, { count: 12, weights: { a: 1, b: 1, c: 2 }, seed: 1 }).ids)).toEqual({ a: 3, b: 3, c: 6 })
    expect(counts(sampleExam(bank, order, { count: 10, weights: { a: 90, b: 90 }, seed: 1 }).ids)).toEqual({ a: 5, b: 5 })
  })
  it('without weights every question is equally likely (proportional to topic size)', () => {
    const lop = [...mk('a', 30), ...mk('b', 10)]
    expect(counts(sampleExam(lop, ['a', 'b'], { count: 20, seed: 3 }).ids)).toEqual({ a: 15, b: 5 })
  })
  it('is reproducible per seed and varies across seeds', () => {
    const cfg = { count: 15, seed: 99 }
    expect(sampleExam(bank, order, cfg).ids).toEqual(sampleExam(bank, order, cfg).ids)
    expect(sampleExam(bank, order, { ...cfg, seed: 100 }).ids).not.toEqual(sampleExam(bank, order, cfg).ids)
    expect(new Set(sampleExam(bank, order, cfg).ids).size).toBe(15)
  })
  it('groups by topic when shuffle is off', () => {
    const ids = sampleExam(bank, order, { count: 9, seed: 1, shuffle: false }).ids
    expect(ids.map((i) => i[0]).join('')).toBe('aaabbbccc')
  })
  it('filters by topic, type and difficulty', () => {
    const q = [...mk('a', 5, { difficulty: 'easy' }), ...mk('a', 5, { difficulty: 'hard' }).map((x) => ({ ...x, id: x.id + 'h' }) as Question), ...mk('b', 5, { type: 'ordering' })]
    expect(sampleExam(q, order, { count: 50, seed: 1, topics: ['a'], difficulties: ['hard'] }).ids).toHaveLength(5)
    expect(sampleExam(q, order, { count: 50, seed: 1, types: ['ordering'] }).ids.every((i) => i.startsWith('b'))).toBe(true)
    expect(sampleExam(q, order, { count: 50, seed: 1, difficulties: ['medium'] })).toMatchObject({ ids: [], warnings: expect.arrayContaining(['no questions match the filters']) })
  })
  it('warns when the pool is too small or a weighted topic runs dry', () => {
    const small = sampleExam(bank, order, { count: 200, seed: 1 })
    expect(small.ids).toHaveLength(90)
    expect(small.warnings[0]).toContain('90 question(s) match')
    const dry = sampleExam([...mk('a', 2), ...mk('b', 30)], ['a', 'b'], { count: 10, weights: { a: 80, b: 20 }, seed: 1 })
    expect(counts(dry.ids)).toEqual({ a: 2, b: 8 })
    expect(dry.warnings.join()).toContain('topic "a" has only 2')
  })
  it('mentions weights for topics that have nothing to draw from', () => {
    const r = sampleExam(mk('a', 5), ['a', 'b'], { count: 3, weights: { b: 50 }, seed: 1 })
    expect(r.warnings.join()).toContain('topic "b" has a weight but no questions')
    expect(r.ids).toHaveLength(3)
  })
})

describe('scoreExam', () => {
  const g = (score: number, graded = true): GradeResult => ({ score, correct: score === 1, graded, detail: {} })
  const qs: Question[] = [
    ...mk('a', 2), { ...mk('b', 1)[0], points: 3 } as Question, { ...mk('b', 1)[0], id: 'sa', type: 'short-answer' } as Question,
  ]
  it('weights by points, breaks down by topic/type, tracks unanswered and pending', () => {
    const s = scoreExam(qs, { 'a-0': g(1), 'a-1': g(0.5), 'b-0': g(0), sa: g(0, false) })
    expect(s.earned).toBe(1.5)
    expect(s.possible).toBe(5)
    expect(s.percent).toBeCloseTo(30)
    expect(s.byTopic.a).toEqual({ earned: 1.5, possible: 2, count: 2 })
    expect(s.byTopic.b).toEqual({ earned: 0, possible: 3, count: 1 })
    expect(s.byType.mcq.count).toBe(3)
    expect(s.pending).toBe(1)
    expect(s.unanswered).toBe(0)
    expect(s.byType['short-answer']).toBeUndefined()
  })
  it('counts a self-graded short answer and treats missing grades as unanswered zeros', () => {
    const s = scoreExam(qs, { sa: g(1) })
    expect(s).toMatchObject({ earned: 1, possible: 6, unanswered: 3, pending: 0 })
  })
  it('empty exam is 0%', () => expect(scoreExam([], {}).percent).toBe(0))
})
