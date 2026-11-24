import { describe, expect, it } from 'vitest'
import { validateManifest, validateQuestionShape } from './validate.ts'

const q = (o: object) => validateQuestionShape(o, { file: 'q.json', index: 3 })
const base = { id: 'a', topic: 't' }

describe('question shape', () => {
  it('accepts a valid mcq', () => {
    const r = q({ ...base, type: 'mcq', prompt: 'p', options: [{ text: 'a', correct: true }, { text: 'b', correct: false }] })
    expect(r.diagnostics).toEqual([])
    expect(r.question?.type).toBe('mcq')
  })
  it('names the file, index, id and field of a missing field', () => {
    const r = q({ ...base, type: 'mcq', prompt: 'p' })
    expect(r.diagnostics).toEqual([
      expect.objectContaining({ file: 'q.json', index: 3, id: 'a', path: '/options', message: 'missing required field "options"' }),
    ])
  })
  it('suggests the intended field for typos', () => {
    const r = q({ ...base, type: 'mcq', prompt: 'p', explaination: 'x', options: [{ text: 'a', correct: true }, { text: 'b', correct: false }] })
    expect(r.diagnostics[0]).toMatchObject({ message: 'unknown field "explaination"', hint: 'did you mean "explanation"?' })
  })
  it('reports the nested path of a malformed option', () => {
    const r = q({ ...base, type: 'mcq', prompt: 'p', options: [{ text: 'a', correct: 'yes' }, { text: 'b', correct: false }] })
    expect(r.diagnostics[0]).toMatchObject({ path: '/options/0/correct' })
    expect(r.diagnostics[0].message).toContain('must be boolean')
  })
  it('suggests a close type name and lists the types otherwise', () => {
    expect(q({ ...base, type: 'multi-selct' }).diagnostics[0]).toMatchObject({ hint: 'did you mean "multi-select"?' })
    expect(q({ ...base, type: 'zzz' }).diagnostics[0].hint).toContain('fill-blank')
    expect(q({ ...base }).diagnostics[0].message).toContain('type')
  })
  it('rejects non-objects', () => {
    expect(q([]).diagnostics[0].message).toContain('JSON object')
  })
  it('summarises union mismatches instead of dumping every branch', () => {
    const r = q({ ...base, type: 'calculation', prompt: 'p', parts: [{ id: 'x', value: 1, tolerance: 'big' }] })
    expect(r.diagnostics).toHaveLength(1)
    expect(r.diagnostics[0]).toMatchObject({ path: '/parts/0/tolerance', message: '"tolerance" has the wrong shape' })
    expect(r.diagnostics[0].hint).toContain('abs')
  })
  it('accepts every documented tolerance and variable form', () => {
    const r = q({
      ...base, type: 'calculation', prompt: 'p {{a}}',
      variables: { a: { choices: [1, 2] }, b: { min: 1, max: 5, step: 2 }, c: { formula: 'a+b' } },
      parts: [{ id: 'x', formula: 'a*b', tolerance: { rel: 0.02 } }, { id: 'y', value: 3, tolerance: 0.5 }],
    })
    expect(r.diagnostics).toEqual([])
  })
})

describe('manifest', () => {
  const ok = { title: 'T', description: 'D', topics: ['a', { id: 'b', title: 'B' }], questions: ['q.json'] }
  it('normalizes string topics', () => {
    const r = validateManifest(ok)
    expect(r.manifest?.topics).toEqual([{ id: 'a', title: 'a' }, { id: 'b', title: 'B' }])
  })
  it('reports missing fields and bad question file extensions', () => {
    const r = validateManifest({ title: 'T', questions: ['q.txt'] })
    const msgs = r.diagnostics.map((d) => d.message)
    expect(msgs).toContain('missing required field "description"')
    expect(msgs).toContain('missing required field "topics"')
    expect(r.diagnostics.find((d) => d.path === '/questions/0')).toBeTruthy()
  })
  it('rejects duplicate topics', () => {
    const r = validateManifest({ ...ok, topics: ['a', 'a'] })
    expect(r.manifest).toBeUndefined()
    expect(r.diagnostics[0].message).toContain('duplicate topic')
  })
  it('flags a bad topic entry with a helpful shape hint', () => {
    const r = validateManifest({ ...ok, topics: [{ title: 'x' }] })
    expect(r.diagnostics[0].hint).toContain('topic id')
  })
})
