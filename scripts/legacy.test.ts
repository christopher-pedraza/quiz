import { describe, expect, it } from 'vitest'
import { loadQuiz } from '../src/core/load/loadQuiz.ts'
import { MemorySource } from '../src/core/source/memory.ts'
import { convertQuestion, inlineCode, slugify, topicFor, type ConvertContext } from './legacy.ts'

const ctx = (): ConvertContext => ({ language: 'python', topicIds: new Map() })
const base = { id: 'x', category: 'Quiz 1.pdf', title: 't', difficulty: 'easy', tags: ['a'], source: { script: 's' }, slides: [{ deck: 'd', page: 1 }] }

describe('topics', () => {
  it('slugifies and de-duplicates categories', () => {
    expect(slugify('P1 student.py')).toBe('p1-student-py')
    const c = ctx()
    expect(topicFor('A B', c)).toBe('a-b')
    expect(topicFor('a-b', c)).toBe('a-b-2')
    expect(topicFor('A B', c)).toBe('a-b')
  })
})

describe('convertQuestion', () => {
  it('fill_blank → fill-blank, renaming accepted_patterns and description', () => {
    const r = convertQuestion({ ...base, type: 'fill_blank', description: 'd', code: 'x = <<BLANK:a>>', hints: ['h'], related_reference: ['torch.zeros'], blanks: [{ id: 'a', answers: ['1'], accepted_patterns: ['\\d'], placeholder: 'p' }] }, ctx())
    expect(r.question).toEqual({
      id: 'x', topic: 'quiz-1-pdf', title: 't', difficulty: 'easy', tags: ['a'], hints: ['h'], reference: ['torch.zeros'],
      type: 'fill-blank', prompt: 'd', language: 'python', template: 'x = <<BLANK:a>>',
      blanks: [{ id: 'a', answers: ['1'], patterns: ['\\d'], placeholder: 'p' }],
    })
    expect(r.notes).toEqual(['dropped "source"', 'dropped "slides"'])
  })
  it('code_choice → choice-mode fill-blank, SLOT markers become BLANK markers', () => {
    const r = convertQuestion({ ...base, type: 'code_choice', description: 'd', code: 'a <<SLOT:s>>', hints: [], slots: [{ id: 's', label: 'L', answers: ['1'], distractors: [{ text: '2', why: 'w' }], show: 3, explanation: 'E' }] }, ctx())
    expect(r.question).toMatchObject({ type: 'fill-blank', mode: 'choice', template: 'a <<BLANK:s>>', explanation: 'E', blanks: [{ id: 's', label: 'L', show: 3, distractors: [{ text: '2', why: 'w' }] }] })
  })
  it('multiple_choice splits into mcq / multi-select (also when "single" has several correct)', () => {
    const opts = (n: number) => [{ text: 'a', correct: true, explanation: 'e' }, { text: 'b', correct: n > 1, explanation: 'e' }, { text: 'c', correct: false, explanation: 'e' }]
    expect(convertQuestion({ ...base, type: 'multiple_choice', prompt: 'p', selection: 'single', options: opts(1) }, ctx()).question?.type).toBe('mcq')
    expect(convertQuestion({ ...base, type: 'multiple_choice', prompt: 'p', selection: 'multiple', options: opts(1) }, ctx()).question?.type).toBe('multi-select')
    const odd = convertQuestion({ ...base, type: 'multiple_choice', prompt: 'p', selection: 'single', options: opts(2) }, ctx())
    expect(odd.question?.type).toBe('multi-select')
    expect(odd.notes.join()).toContain('several correct')
  })
  it('multiple_choice code moves into the prompt', () => {
    const q = convertQuestion({ ...base, type: 'multiple_choice', prompt: 'p', code: 'x = 1', selection: 'single', options: [] }, ctx()).question!
    expect(inlineCode(q, 'python')).toMatchObject({ prompt: 'p\n\n```python\nx = 1\n```' })
    expect(inlineCode(q, 'python')).not.toHaveProperty('_code')
  })
  it('calculation, param_count and generated_calc all become calculation', () => {
    const gen = convertQuestion({ ...base, type: 'generated_calc', prompt: '{{a}}', variables: { a: { choices: [1] } }, constraints: ['a>0'], parts: [{ id: 'p', formula: 'a' }] }, ctx()).question
    expect(gen).toMatchObject({ type: 'calculation', variables: { a: { choices: [1] } }, constraints: ['a>0'], parts: [{ id: 'p', formula: 'a' }] })
    const pc = convertQuestion({ ...base, type: 'param_count', prompt: 'p', code: 'm', parts: [{ id: 'p', value: 3, tolerance: 0.5, unit: 'u' }] }, ctx()).question
    expect(pc).toMatchObject({ type: 'calculation', code: 'm', language: 'python', parts: [{ id: 'p', value: 3, tolerance: 0.5, unit: 'u' }] })
  })
  it('open_ended → short-answer with a rubric from key_points', () => {
    expect(convertQuestion({ ...base, type: 'open_ended', prompt: 'p', model_answer: 'm', key_points: ['a', 'b'] }, ctx()).question).toMatchObject({ type: 'short-answer', modelAnswer: 'm', rubric: [{ text: 'a' }, { text: 'b' }] })
  })
  it('reports unknown types instead of guessing', () => {
    expect(convertQuestion({ ...base, type: 'mystery' }, ctx())).toEqual({ notes: ['unknown legacy type "mystery"'] })
  })
  it('output of every converter branch passes the real validator', async () => {
    const c = ctx()
    const qs = [
      convertQuestion({ ...base, id: 'a', type: 'fill_blank', description: 'd', code: 'x = <<BLANK:a>>', hints: [], blanks: [{ id: 'a', answers: ['1'] }] }, c),
      convertQuestion({ ...base, id: 'b', type: 'find_fix', description: 'd', code: 'x = 1', hints: [], errors: [{ line: 1, fixes: ['x = 2'] }] }, c),
      convertQuestion({ ...base, id: 'c', type: 'code_choice', description: 'd', code: 'a <<SLOT:s>>', hints: [], slots: [{ id: 's', answers: ['1'], distractors: [{ text: '2', why: 'w' }, { text: '3', why: 'w' }] }] }, c),
      convertQuestion({ ...base, id: 'd', type: 'multiple_choice', prompt: 'p', selection: 'single', options: [{ text: 'a', correct: true, explanation: 'e' }, { text: 'b', correct: false, explanation: 'e' }] }, c),
      convertQuestion({ ...base, id: 'e', type: 'open_ended', prompt: 'p', model_answer: 'm', key_points: ['k'] }, c),
    ].map((r) => r.question)
    const files = {
      'manifest.json': JSON.stringify({ title: 'T', description: 'D', topics: [...c.topicIds.values()], questions: ['q.json'] }),
      'q.json': JSON.stringify(qs),
    }
    const r = await loadQuiz(new MemorySource(files))
    expect(r.ok && r.quiz.questions).toHaveLength(5)
    expect(r.ok && r.quiz.diagnostics).toEqual([])
  })
})
