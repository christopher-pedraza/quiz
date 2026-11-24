import { describe, expect, it } from 'vitest'
import { EMPTY_FILTERS, filterQuestions, isFiltering, type FilterContext } from './filter.ts'
import type { Question } from './model/types.ts'

const q = (id: string, topic: string, extra: object = {}) => ({ type: 'mcq', id, topic, prompt: `prompt of ${id}`, options: [], ...extra }) as unknown as Question
const bank = [
  q('a1', 'a', { title: 'Softmax basics', difficulty: 'easy', tags: ['probability'] }),
  q('a2', 'a', { title: 'Cross entropy', difficulty: 'hard' }),
  q('b1', 'b', { type: 'ordering', title: 'Training loop', difficulty: 'easy' }),
  q('b2', 'b', { title: 'Dropout' }),
]
const ctx: FilterContext = {
  topics: [{ id: 'a', title: 'Losses' }, { id: 'b', title: 'Optimisation' }],
  attempts: { a1: { score: 1, best: 1, attempts: 1, at: 0 }, a2: { score: 0.5, best: 0.5, attempts: 2, at: 0 }, b1: { score: 0, best: 0, attempts: 1, at: 0, pending: true } },
  flags: new Set(['b2', 'a2']),
}
const ids = (f: Partial<typeof EMPTY_FILTERS>) => filterQuestions(bank, { ...EMPTY_FILTERS, ...f }, ctx).map((x) => x.id)

describe('filterQuestions', () => {
  it('returns everything without filters, in bank order', () => {
    expect(ids({})).toEqual(['a1', 'a2', 'b1', 'b2'])
    expect(isFiltering(EMPTY_FILTERS)).toBe(false)
  })
  it('searches title, id, tags, topic title and prompt; all words must match', () => {
    expect(ids({ query: 'softmax' })).toEqual(['a1'])
    expect(ids({ query: 'PROBABILITY' })).toEqual(['a1'])
    expect(ids({ query: 'optimisation' })).toEqual(['b1', 'b2'])
    expect(ids({ query: 'prompt of b2' })).toEqual(['b2'])
    expect(ids({ query: 'cross softmax' })).toEqual([])
    expect(ids({ query: '  ' })).toHaveLength(4)
  })
  it('filters by topic, type and difficulty (questions without difficulty never match a difficulty filter)', () => {
    expect(ids({ topics: ['b'] })).toEqual(['b1', 'b2'])
    expect(ids({ types: ['ordering'] })).toEqual(['b1'])
    expect(ids({ difficulties: ['easy'] })).toEqual(['a1', 'b1'])
    expect(ids({ difficulties: ['easy', 'hard'], topics: ['a'] })).toEqual(['a1', 'a2'])
  })
  it('status: unanswered, incorrect, correct and flagged; several are OR-ed; pending counts as unanswered', () => {
    expect(ids({ statuses: ['unanswered'] })).toEqual(['b1', 'b2'])
    expect(ids({ statuses: ['incorrect'] })).toEqual(['a2'])
    expect(ids({ statuses: ['correct'] })).toEqual(['a1'])
    expect(ids({ statuses: ['flagged'] })).toEqual(['a2', 'b2'])
    expect(ids({ statuses: ['correct', 'flagged'] })).toEqual(['a1', 'a2', 'b2'])
    expect(ids({ statuses: ['flagged'], topics: ['b'] })).toEqual(['b2'])
  })
})
