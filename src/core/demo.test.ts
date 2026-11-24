import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { readFolder } from '../../scripts/folder.ts'
import { loadQuiz } from './load/loadQuiz.ts'
import { MemorySource } from './source/memory.ts'
import { emptyAnswer, grade, instantiate } from './question-types/index.ts'
import { QUESTION_TYPES, type Question } from './model/types.ts'

const files = readFolder(join(process.cwd(), 'public/samples/demo'))
const loaded = await loadQuiz(new MemorySource(files))

describe('bundled demo quiz', () => {
  it('loads with no diagnostics at all', () => {
    expect(loaded.ok).toBe(true)
    if (loaded.ok) expect(loaded.quiz.diagnostics).toEqual([])
  })
  const quiz = loaded.ok ? loaded.quiz : undefined
  it('shows every question type', () => {
    const types = new Set(quiz!.questions.map((q) => q.type))
    for (const { type } of QUESTION_TYPES) expect(types, `demo is missing "${type}"`).toContain(type)
  })
  it('exercises all fill-blank modes and both calculation flavours', () => {
    const fb = quiz!.questions.filter((q): q is Extract<Question, { type: 'fill-blank' }> => q.type === 'fill-blank')
    expect(new Set(fb.map((q) => q.mode ?? 'text'))).toEqual(new Set(['text', 'choice', 'drag']))
    const calcs = quiz!.questions.filter((q) => q.type === 'calculation')
    expect(calcs.some((q) => q.type === 'calculation' && q.variables)).toBe(true)
    expect(calcs.some((q) => q.type === 'calculation' && !q.variables)).toBe(true)
  })
  it('every question instantiates, is deterministic per seed, and grades an empty answer without throwing', () => {
    for (const q of quiz!.questions) {
      const a = instantiate(q, 123)
      expect(instantiate(q, 123), q.id).toEqual(a)
      const r = grade(a, emptyAnswer(a))
      expect(r.score, q.id).toBeGreaterThanOrEqual(0)
      expect(r.score, q.id).toBeLessThanOrEqual(1)
    }
  })
})
