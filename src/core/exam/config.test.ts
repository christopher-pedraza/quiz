import { describe, expect, it } from 'vitest'
import type { Question } from '../model/types.ts'
import { configFromState, defaultBuilderState, presetFromConfig, stateFromPreset } from './config.ts'

const qs = [{ type: 'mcq', id: '1', topic: 'a' }, { type: 'ordering', id: '2', topic: 'b' }] as unknown as Question[]
const base = defaultBuilderState(qs, ['a', 'b'], { count: 50, minutes: 30 })
const all = { topics: ['a', 'b'], types: ['mcq', 'ordering'] }

describe('exam builder config', () => {
  it('defaults select everything and cap the count at the bank size', () => {
    expect(base).toMatchObject({ count: 2, minutes: 30, topics: ['a', 'b'], types: ['mcq', 'ordering'], weights: {} })
  })
  it('leaves out filters that select everything, and untimed means no minutes', () => {
    const c = configFromState({ ...base, minutes: 0 }, all, 7)
    expect(c).toEqual({ count: 2, topics: undefined, types: undefined, difficulties: undefined, shuffle: true, seed: 7 })
  })
  it('keeps real subsets, and only weights of selected topics', () => {
    const c = configFromState({ ...base, topics: ['a'], types: ['mcq'], difficulties: ['hard'], weights: { a: 70, b: 30 } }, all, 7)
    expect(c).toMatchObject({ topics: ['a'], types: ['mcq'], difficulties: ['hard'], weights: { a: 70 }, minutes: 30 })
  })
  it('preset round trip: seed only when locked', () => {
    const state = { ...base, count: 2, weights: { a: 60 }, minutes: 10 }
    const config = configFromState(state, all, 99)
    expect(presetFromConfig(config, false)).not.toHaveProperty('seed')
    expect(presetFromConfig(config, true)).toMatchObject({ seed: 99, count: 2, minutes: 10, weights: { a: 60 } })
    const back = stateFromPreset(presetFromConfig(config, true), base)
    expect(back).toMatchObject({ count: 2, minutes: 10, weights: { a: 60 }, lockSeed: true, topics: ['a', 'b'] })
  })
  it('a preset naming topics that do not exist selects everything; unknown weights are dropped', () => {
    const s = stateFromPreset({ count: 5, topics: ['zzz'], types: ['mcq'], weights: { zzz: 5, a: 1 } }, base)
    expect(s.topics).toEqual(['a', 'b'])
    expect(s.types).toEqual(['mcq'])
    expect(s.weights).toEqual({ a: 1 })
  })
})
