import { describe, expect, it } from 'vitest'
import { AppStore, MAX_EXAMS, MAX_RECENT, QuizStore, statusOf, type KV } from './store.ts'
import type { ExamResult } from '../exam/score.ts'

const mem = (): KV & { data: Map<string, string> } => {
  const data = new Map<string, string>()
  return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v), removeItem: (k) => void data.delete(k) }
}

describe('QuizStore', () => {
  it('namespaces everything by slug so quizzes never collide', () => {
    const kv = mem()
    const a = new QuizStore(kv, 'gh:o/r@main#a')
    const b = new QuizStore(kv, 'gh:o/r@main#b')
    a.recordAttempt('q1', 1)
    a.toggleFlag('q1')
    expect(b.attempts()).toEqual({})
    expect(b.flags().size).toBe(0)
    expect([...kv.data.keys()].every((k) => k.startsWith('quiz:v1:gh:o/r@main#a:'))).toBe(true)
  })
  it('tracks last score, best score and attempt count', () => {
    const s = new QuizStore(mem(), 'x')
    s.recordAttempt('q', 1, { at: 1 })
    const a = s.recordAttempt('q', 0.25, { at: 2, seed: 9 })
    expect(a).toEqual({ score: 0.25, best: 1, attempts: 2, at: 2, seed: 9 })
    expect(statusOf(s.attempts().q)).toBe('incorrect')
    expect(statusOf(undefined)).toBe('unanswered')
    expect(statusOf({ ...a, score: 1 })).toBe('correct')
  })
  it('pending self-grade keeps the previous best and reports pending', () => {
    const s = new QuizStore(mem(), 'x')
    const a = s.recordAttempt('sa', 0, { pending: true })
    expect(statusOf(a)).toBe('pending')
    expect(a.best).toBe(0)
  })
  it('can forget one question, all flags, or all exams without touching anything else', () => {
    const kv = mem()
    const s = new QuizStore(kv, 'x')
    const other = new QuizStore(kv, 'y')
    s.recordAttempt('a', 1)
    s.recordAttempt('b', 0)
    s.toggleFlag('a')
    s.addExam({ id: '1' } as ExamResult)
    other.recordAttempt('a', 1)
    s.clearAttempt('a')
    expect(Object.keys(s.attempts())).toEqual(['b'])
    s.clearAttempt('missing') // no-op
    s.clearFlags()
    s.clearExams()
    expect(s.flags().size).toBe(0)
    expect(s.exams()).toEqual([])
    expect(Object.keys(s.attempts())).toEqual(['b'])
    s.clearAttempts()
    expect(s.attempts()).toEqual({})
    expect(Object.keys(other.attempts())).toEqual(['a']) // another quiz is untouched
  })
  it('toggles flags', () => {
    const s = new QuizStore(mem(), 'x')
    expect(s.toggleFlag('q')).toBe(true)
    expect(s.flags().has('q')).toBe(true)
    expect(s.toggleFlag('q')).toBe(false)
    expect(s.flags().size).toBe(0)
  })
  it('keeps the newest exams up to the cap', () => {
    const s = new QuizStore(mem(), 'x')
    for (let i = 0; i < MAX_EXAMS + 5; i++) s.addExam({ id: String(i) } as ExamResult)
    expect(s.exams()).toHaveLength(MAX_EXAMS)
    expect(s.exams()[0].id).toBe(String(MAX_EXAMS + 4))
  })
  it('merges ui state over defaults', () => {
    const s = new QuizStore(mem(), 'x')
    s.setUi({ topic: 'a' })
    expect(s.ui({ topic: null, query: '' })).toEqual({ topic: 'a', query: '' })
  })
  it('survives corrupt data and a storage that throws', () => {
    const kv = mem()
    kv.setItem('quiz:v1:x:attempts', '{nope')
    kv.setItem('quiz:v1:x:flags', '{"a":1}')
    kv.setItem('quiz:v1:x:exams', '"str"')
    const s = new QuizStore(kv, 'x')
    expect(s.attempts()).toEqual({})
    expect(s.flags().size).toBe(0)
    expect(s.exams()).toEqual([])
    const full: KV = { getItem: () => null, setItem: () => { throw new DOMException('full', 'QuotaExceededError') }, removeItem: () => {} }
    expect(() => new QuizStore(full, 'x').recordAttempt('q', 1)).not.toThrow()
  })
})

describe('AppStore', () => {
  const e = (slug: string, openedAt = 0) => ({ slug, source: { kind: 'sample' as const, name: 'demo' }, title: slug, openedAt })
  it('keeps a de-duplicated, bounded, most-recent-first list', () => {
    const s = new AppStore(mem())
    s.pushRecent(e('a'))
    s.pushRecent(e('b'))
    s.pushRecent(e('a', 5))
    expect(s.recent().map((r) => r.slug)).toEqual(['a', 'b'])
    for (let i = 0; i < MAX_RECENT + 3; i++) s.pushRecent(e(`s${i}`))
    expect(s.recent()).toHaveLength(MAX_RECENT)
    s.removeRecent(`s${MAX_RECENT + 2}`)
    expect(s.recent()[0].slug).toBe(`s${MAX_RECENT + 1}`)
  })
})
