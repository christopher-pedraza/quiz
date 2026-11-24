import { describe, expect, it } from 'vitest'
import type { Answer, Question } from '../model/types.ts'
import { checkQuestion, emptyAnswer, grade, instantiate, type CalculationInstance, type FillBlankInstance } from './index.ts'
import { deriveSeed } from '../random.ts'

const b = { id: 'q', topic: 't' }
const run = (q: Question, a: Answer, seed = 1) => grade(instantiate(q, seed), a)
const msgs = (q: Question) => checkQuestion(q).map((i) => i.message)

describe('fill-blank', () => {
  const code: Question = {
    ...b, type: 'fill-blank', language: 'python', template: 'x = <<BLANK:a>>\ny = <<BLANK:b>>',
    blanks: [{ id: 'a', answers: ['torch.zeros(3)'], patterns: ['torch\\.ones\\(\\d\\)'] }, { id: 'b', answers: ['None'] }],
  }
  it('grades per blank and is code-aware', () => {
    expect(run(code, { type: 'fill-blank', values: { a: 'torch.zeros( 3 )', b: 'None' } }).score).toBe(1)
    const r = run(code, { type: 'fill-blank', values: { a: 'torch.ones(2)', b: 'none' } })
    expect(r.score).toBe(0.5)
    expect(r.detail).toEqual({ blanks: { a: true, b: false } })
  })
  it('prose blanks are case-insensitive unless asked otherwise', () => {
    const prose: Question = { ...b, type: 'fill-blank', template: 'The <<BLANK:x>> sort is stable.', blanks: [{ id: 'x', answers: ['merge'] }] }
    expect(run(prose, { type: 'fill-blank', values: { x: ' Merge. ' } }).correct).toBe(true)
    const strict = { ...prose, blanks: [{ id: 'x', answers: ['merge'], caseSensitive: true }] } as Question
    expect(run(strict, { type: 'fill-blank', values: { x: 'Merge' } }).correct).toBe(false)
  })
  it('choice mode samples one accepted answer plus distractors, reproducibly', () => {
    const q: Question = {
      ...b, type: 'fill-blank', mode: 'choice', language: 'python', template: '<<BLANK:a>>',
      blanks: [{ id: 'a', answers: ['x.T', 'x.t()'], distractors: ['x', 'x.T', { text: 'x.view', why: 'no' }, 'x.sum()', 'x.mean()'], show: 3 }],
    }
    const i1 = instantiate(q, 5) as FillBlankInstance
    const i2 = instantiate(q, 5) as FillBlankInstance
    expect(i1.choices).toEqual(i2.choices)
    const opts = i1.choices.a
    expect(opts).toHaveLength(3)
    expect(opts.filter((o) => o.correct)).toHaveLength(1)
    // a distractor equal to an accepted answer is never shown as wrong
    for (let s = 0; s < 30; s++) expect((instantiate(q, s) as FillBlankInstance).choices.a.filter((o) => !o.correct && o.text === 'x.T')).toEqual([])
    const seeds = new Set(Array.from({ length: 30 }, (_, s) => JSON.stringify((instantiate(q, s) as FillBlankInstance).choices.a)))
    expect(seeds.size).toBeGreaterThan(1)
  })
  it('static choice options are marked correct by matching', () => {
    const q: Question = { ...b, type: 'fill-blank', mode: 'choice', template: '<<BLANK:a>>', blanks: [{ id: 'a', answers: ['two'], options: ['one', 'two', 'three'] }] }
    expect((instantiate(q, 1) as FillBlankInstance).choices.a.map((o) => o.correct)).toEqual([false, true, false])
  })
  it('drag mode builds one shared shuffled bank with distractors', () => {
    const q: Question = {
      ...b, type: 'fill-blank', mode: 'drag', template: '<<BLANK:a>> then <<BLANK:b>>',
      blanks: [{ id: 'a', answers: ['first'] }, { id: 'b', answers: ['second'] }], distractors: ['third', 'first'],
    }
    const inst = instantiate(q, 3) as FillBlankInstance
    expect(inst.bank.map((c) => c.text).sort()).toEqual(['first', 'second', 'third'])
    expect(run(q, { type: 'fill-blank', values: { a: 'first', b: 'second' } }).correct).toBe(true)
    expect(run(q, { type: 'fill-blank', values: { a: 'second', b: 'first' } }).score).toBe(0)
  })
  it('semantic checks', () => {
    expect(msgs({ ...code, template: 'x = <<BLANK:a>>', blanks: code.blanks } as Question)).toEqual(['blank "b" has no <<BLANK:b>> marker in the template'])
    expect(msgs({ ...code, template: '<<BLANK:a>> <<BLANK:b>> <<BLANK:zzz>>' } as Question)).toEqual(['marker <<BLANK:zzz>> has no entry in "blanks"'])
    expect(msgs({ ...code, template: '<<BLANK:a>> <<BLANK:a>> <<BLANK:b>>' } as Question)).toEqual(['marker <<BLANK:a>> appears 2 times'])
    expect(msgs({ ...code, blanks: [{ id: 'a', answers: ['1'], patterns: ['('] }, { id: 'b', answers: ['2'] }] } as Question)[0]).toContain('invalid regular expression')
    expect(msgs({ ...b, type: 'fill-blank', mode: 'choice', template: '<<BLANK:a>>', blanks: [{ id: 'a', answers: ['x'] }] })[0]).toContain('needs "options" or "distractors"')
    expect(msgs({ ...b, type: 'fill-blank', mode: 'choice', template: '<<BLANK:a>>', blanks: [{ id: 'a', answers: ['x'], options: ['y', 'z'] }] })[0]).toContain('none of the options')
    expect(msgs({ ...b, type: 'fill-blank', mode: 'drag', template: '<<BLANK:a>>', blanks: [{ id: 'a', answers: ['x'], mode: 'text' }] })[0]).toContain('whole question')
  })
})

describe('code-debug', () => {
  const q: Question = {
    ...b, type: 'code-debug', prompt: 'p', code: 'a\nb\nc\nd',
    errors: [{ line: 2, fixes: ['b = 1'] }, { line: 4, fixes: ['d = 2'], options: ['d = 2', 'd = 3'] }],
  }
  it('rewards correct flag+fix and penalizes false flags', () => {
    expect(run(q, { type: 'code-debug', marked: [2, 4], fixes: { 2: 'b=1', 4: 'd = 2' } }).correct).toBe(true)
    const half = run(q, { type: 'code-debug', marked: [2], fixes: { 2: 'b = 1' } })
    expect(half.score).toBe(0.5)
    expect(half.detail.missed).toEqual([4])
    const noisy = run(q, { type: 'code-debug', marked: [1, 2, 4], fixes: { 2: 'b = 1', 4: 'd = 2' } })
    expect(noisy.score).toBe(0.5)
    expect((noisy.detail.verdicts as Record<number, string>)[1]).toBe('not-an-error')
    expect(run(q, { type: 'code-debug', marked: [2], fixes: { 2: 'wrong' } }).detail.verdicts).toEqual({ 2: 'wrong-fix' })
    expect(run(q, { type: 'code-debug', marked: [1, 3], fixes: {} }).score).toBe(0)
  })
  it('checks line numbers and fix options', () => {
    expect(msgs({ ...q, errors: [{ line: 9, fixes: ['x'] }] } as Question)[0]).toContain('outside the code')
    expect(msgs({ ...q, errors: [{ line: 1, fixes: ['x'] }, { line: 1, fixes: ['y'] }] } as Question)[0]).toContain('listed twice')
    expect(msgs({ ...q, errors: [{ line: 1, fixes: ['x'], options: ['y', 'z'] }] } as Question)[0]).toContain('none of the options')
    expect(msgs({ ...q, errors: [{ line: 1, fixes: ['x'], options: ['x', 'z'] }, { line: 2, fixes: ['y'] }] } as Question)[0]).toContain('only some errors have')
  })
})

describe('mcq / multi-select', () => {
  const opts = [{ text: 'a', correct: false }, { text: 'b', correct: true }, { text: 'c', correct: false }, { text: 'd', correct: true }]
  const m: Question = { ...b, type: 'multi-select', prompt: 'p', options: opts }
  it('mcq is 0/1', () => {
    const q: Question = { ...b, type: 'mcq', prompt: 'p', options: opts.slice(0, 3) }
    expect(run(q, { type: 'mcq', picked: 1 }).correct).toBe(true)
    expect(run(q, { type: 'mcq', picked: 0 }).score).toBe(0)
    expect(run(q, { type: 'mcq', picked: null }).score).toBe(0)
    expect(msgs({ ...q, options: opts } as Question)[0]).toContain('exactly one correct option, found 2')
  })
  it('multi-select all-or-nothing by default', () => {
    expect(run(m, { type: 'multi-select', picked: [1, 3] }).correct).toBe(true)
    expect(run(m, { type: 'multi-select', picked: [1] }).score).toBe(0)
    expect(run(m, { type: 'multi-select', picked: [1, 3, 0] }).score).toBe(0)
  })
  it('multi-select partial subtracts wrong picks and floors at 0', () => {
    const p = { ...m, grading: 'partial' } as Question
    expect(run(p, { type: 'multi-select', picked: [1] }).score).toBe(0.5)
    expect(run(p, { type: 'multi-select', picked: [1, 0] }).score).toBe(0)
    expect(run(p, { type: 'multi-select', picked: [0, 2] }).score).toBe(0)
    expect(run(p, { type: 'multi-select', picked: [1, 3] }).score).toBe(1)
  })
  it('shuffles display order only when asked, deterministically', () => {
    const q: Question = { ...b, type: 'mcq', prompt: 'p', options: opts.slice(0, 3), shuffle: true }
    expect(instantiate(q, 9)).toEqual(instantiate(q, 9))
    expect((instantiate({ ...q, shuffle: false } as Question, 9) as { order: number[] }).order).toEqual([0, 1, 2])
  })
})

describe('calculation', () => {
  it('static question with tolerance variants', () => {
    const q: Question = {
      ...b, type: 'calculation', prompt: 'p',
      parts: [{ id: 'a', value: 100, tolerance: { rel: 0.02 }, unit: 'ms' }, { id: 'b', value: 2.5, tolerance: 0.01 }, { id: 'c', value: 10 }],
    }
    expect(run(q, { type: 'calculation', values: { a: '101.5', b: '2.51', c: '5*2' } }).correct).toBe(true)
    expect(run(q, { type: 'calculation', values: { a: '103', b: '2.52', c: '11' } }).score).toBe(0)
    expect(run(q, { type: 'calculation', values: {} }).score).toBe(0)
  })
  const gen: Question = {
    ...b, type: 'calculation', prompt: 'H={{H}}, k={{k}}. Output?', explanation: 'H-k+1 = {{H-k+1}}',
    variables: { H: { choices: [28, 32, 64] }, k: { min: 3, max: 7, step: 2 }, o: { formula: 'H - k + 1' } },
    constraints: ['o > 0'],
    parts: [{ id: 'h', label: 'out ({{o}})', formula: 'H - k + 1' }],
  }
  it('is a pure function of the seed and renders placeholders', () => {
    const i1 = instantiate(gen, 42) as CalculationInstance
    expect(instantiate(gen, 42)).toEqual(i1)
    expect(i1.question.prompt).toBe(`H=${i1.vars.H}, k=${i1.vars.k}. Output?`)
    expect(i1.question.parts[0].value).toBe(i1.vars.H - i1.vars.k + 1)
    expect(i1.question.explanation).toBe(`H-k+1 = ${i1.vars.o}`)
    expect(run(gen, { type: 'calculation', values: { h: String(i1.vars.o) } }, 42).correct).toBe(true)
  })
  it('different seeds give different numbers; exam seeds derived per question are stable', () => {
    const draws = new Set(Array.from({ length: 40 }, (_, s) => JSON.stringify((instantiate(gen, s) as CalculationInstance).vars)))
    expect(draws.size).toBeGreaterThan(3)
    expect(deriveSeed(7, 'q1')).toBe(deriveSeed(7, 'q1'))
    expect(deriveSeed(7, 'q1')).not.toBe(deriveSeed(7, 'q2'))
    expect(deriveSeed(7, 'q1')).not.toBe(deriveSeed(8, 'q1'))
  })
  it('respects constraints', () => {
    const q = { ...gen, explanation: undefined, variables: { x: { min: 1, max: 10 } }, constraints: ['x % 5 == 0'], parts: [{ id: 'p', formula: 'x' }], prompt: '{{x}}' } as Question
    for (let s = 0; s < 20; s++) expect([5, 10]).toContain((instantiate(q, s) as CalculationInstance).vars.x)
  })
  it('semantic checks catch broken templates', () => {
    expect(msgs({ ...gen, parts: [{ id: 'h', formula: 'nope + 1' }] } as Question)[0]).toContain('unknown variable "nope"')
    expect(msgs({ ...gen, constraints: ['H < 0'] } as Question)[0]).toContain('constraints could not be satisfied')
    expect(msgs({ ...gen, prompt: '{{zzz}}' } as Question)[0]).toContain('unknown variable "zzz"')
    expect(msgs({ ...gen, parts: [{ id: 'h', value: 1, formula: '1' }] } as Question)[0]).toContain('exactly one of')
    expect(msgs({ ...gen, parts: [{ id: 'h' }] } as Question)[0]).toContain('exactly one of')
    expect(msgs({ ...gen, variables: { pi: { choices: [1] } } } as Question)[0]).toContain('not a valid variable name')
    expect(msgs(gen)).toEqual([])
  })
})

describe('ordering', () => {
  const q: Question = { ...b, type: 'ordering', prompt: 'p', items: ['a', 'b', 'c', 'd'] }
  it('never starts solved and is reproducible', () => {
    for (let s = 0; s < 50; s++) expect((instantiate(q, s) as { display: number[] }).display).not.toEqual([0, 1, 2, 3])
    expect(instantiate(q, 1)).toEqual(instantiate(q, 1))
    expect(instantiate({ ...q, items: ['a', 'b'] } as Question, 1)).toHaveProperty('display', [1, 0])
  })
  it('exact vs partial grading', () => {
    expect(run(q, { type: 'ordering', order: [0, 1, 2, 3] }).correct).toBe(true)
    expect(run(q, { type: 'ordering', order: [1, 0, 2, 3] }).score).toBe(0)
    const p = { ...q, grading: 'partial' } as Question
    expect(run(p, { type: 'ordering', order: [1, 0, 2, 3] }).score).toBeCloseTo(5 / 6)
    expect(run(p, { type: 'ordering', order: [3, 2, 1, 0] }).score).toBe(0)
    expect(run(p, { type: 'ordering', order: [0, 0, 1, 2] }).detail).toEqual({ invalid: true })
  })
  it('empty answer is the display order', () => {
    const inst = instantiate(q, 4)
    expect(emptyAnswer(inst)).toEqual({ type: 'ordering', order: (inst as { display: number[] }).display })
  })
})

describe('matching', () => {
  const q: Question = {
    ...b, type: 'matching', prompt: 'p', distractors: ['O(1)'],
    pairs: [{ left: 'merge', right: 'O(n log n)' }, { left: 'heap', right: 'O(n log n)' }, { left: 'bubble', right: 'O(n^2)' }],
  }
  it('offers each right once, plus distractors, and lets rights repeat in answers', () => {
    expect((instantiate(q, 1) as { rightOptions: string[] }).rightOptions.sort()).toEqual(['O(1)', 'O(n log n)', 'O(n^2)'])
    expect(run(q, { type: 'matching', chosen: ['O(n log n)', 'O(n log n)', 'O(n^2)'] }).correct).toBe(true)
  })
  it('partial by default, all-or-nothing on request', () => {
    const a: Answer = { type: 'matching', chosen: ['O(n log n)', 'O(1)', null] }
    expect(run(q, a).score).toBeCloseTo(1 / 3)
    expect(run({ ...q, grading: 'all-or-nothing' } as Question, a).score).toBe(0)
  })
  it('checks distractors', () => {
    expect(msgs({ ...q, distractors: ['O(n^2)'] } as Question)[0]).toContain('also a right-hand side')
  })
})

describe('categorize', () => {
  const q: Question = {
    ...b, type: 'categorize', prompt: 'p', distractors: ['Banana'],
    categories: [{ id: 'f', title: 'Fruit', items: ['Apple', 'Pear'] }, { id: 'v', title: 'Veg', items: ['Kale', 'Leek'] }],
  }
  it('pool contains items and distractors', () => {
    expect((instantiate(q, 1) as { pool: string[] }).pool.sort()).toEqual(['Apple', 'Banana', 'Kale', 'Leek', 'Pear'])
  })
  it('grades by fraction placed correctly; order inside a bucket is irrelevant', () => {
    expect(run(q, { type: 'categorize', placed: { Pear: 'f', Apple: 'f', Kale: 'v', Leek: 'v' } }).correct).toBe(true)
    expect(run(q, { type: 'categorize', placed: { Apple: 'f', Pear: 'v', Kale: 'v' } }).score).toBe(0.5)
  })
  it('distractor penalty is optional', () => {
    const placed = { Apple: 'f', Pear: 'f', Kale: 'v', Leek: 'v', Banana: 'f' }
    expect(run(q, { type: 'categorize', placed }).score).toBe(1)
    expect(run({ ...q, distractorPenalty: 0.5 } as Question, { type: 'categorize', placed }).score).toBe(0.875)
    expect(run({ ...q, distractorPenalty: 1 } as Question, { type: 'categorize', placed: { Banana: 'v' } }).score).toBe(0)
  })
  it('chips must be unique', () => {
    expect(msgs({ ...q, categories: [{ id: 'f', title: 'Fruit', items: ['A'] }, { id: 'v', title: 'Veg', items: ['A'] }] } as Question)[0]).toContain('already in "Fruit"')
    expect(msgs({ ...q, distractors: ['Apple'] } as Question)[0]).toContain('also an item')
    expect(msgs({ ...q, categories: [{ id: 'f', title: 'F', items: ['A'] }, { id: 'f', title: 'G', items: ['B'] }] } as Question)[0]).toContain('duplicate category id')
  })
})

describe('short-answer', () => {
  const q: Question = { ...b, type: 'short-answer', prompt: 'p', modelAnswer: 'm', rubric: [{ text: 'a' }, { text: 'b', points: 3 }] }
  it('is ungraded until self-graded, then point-weighted', () => {
    const pending = run(q, { type: 'short-answer', text: 'my answer', checked: [], selfGraded: false })
    expect(pending).toMatchObject({ graded: false, correct: false, score: 0 })
    expect(run(q, { type: 'short-answer', text: '', checked: [1], selfGraded: true }).score).toBe(0.75)
    expect(run(q, { type: 'short-answer', text: '', checked: [0, 1], selfGraded: true }).correct).toBe(true)
    expect(run(q, { type: 'short-answer', text: '', checked: [], selfGraded: true })).toMatchObject({ graded: true, score: 0 })
  })
})

it('rejects an answer of the wrong type', () => {
  expect(() => run({ ...b, type: 'mcq', prompt: 'p', options: [{ text: 'a', correct: true }, { text: 'b', correct: false }] }, { type: 'ordering', order: [] })).toThrow(/does not match/)
})
