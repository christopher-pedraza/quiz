import { describe, expect, it } from 'vitest'
import { MemorySource } from '../source/memory.ts'
import { LocalFolderSource } from '../source/local.ts'
import { loadQuiz, parseQuestionFile } from './loadQuiz.ts'

const manifest = { title: 'T', description: 'D', topics: ['a', 'b'], questions: ['q1.json', 'q2.jsonl'] }
const mcq = (id: string, extra: object = {}) => ({
  type: 'mcq', id, topic: 'a', prompt: 'p', options: [{ text: 'x', correct: true }, { text: 'y', correct: false }], ...extra,
})
const src = (files: Record<string, unknown>) =>
  new MemorySource(Object.fromEntries(Object.entries(files).map(([k, v]) => [k, typeof v === 'string' ? v : JSON.stringify(v)])))

describe('loadQuiz', () => {
  it('loads json and jsonl files, reference and theme', async () => {
    const r = await loadQuiz(src({
      'manifest.json': { ...manifest, reference: 'ref.md', theme: 'theme.json' },
      'q1.json': [mcq('one')],
      'q2.jsonl': JSON.stringify(mcq('two')) + '\n\n' + JSON.stringify(mcq('three', { topic: 'b' })) + '\n',
      'ref.md': '# Ref',
      'theme.json': { accent: '#336699' },
    }))
    expect(r.ok && r.quiz.questions.map((q) => q.id)).toEqual(['one', 'two', 'three'])
    if (!r.ok) throw new Error()
    expect(r.quiz.reference).toEqual({ kind: 'markdown', text: '# Ref' })
    expect(r.quiz.theme?.vars['--accent']).toBe('#336699')
    expect(r.quiz.diagnostics).toEqual([])
    expect(r.quiz.skipped).toBe(0)
  })

  it('explains a missing manifest with the URL tried', async () => {
    const r = await loadQuiz(src({}))
    expect(r.ok).toBe(false)
    expect(r.ok ? [] : r.diagnostics[0]).toMatchObject({ file: 'manifest.json', message: expect.stringContaining('manifest.json not found') })
    expect(!r.ok && r.diagnostics[0].hint).toContain('memory://manifest.json')
  })
  it('adds GitHub-specific advice for a missing manifest', async () => {
    const gh = { slug: 'gh:o/r@main#', label: '', urlFor: (p: string) => `https://raw/${p}`, assetUrl: (p: string) => p, readText: async () => { throw new (await import('../source/types.ts')).SourceError('not-found', 'https://raw/manifest.json', 404) } }
    const r = await loadQuiz(gh)
    expect(!r.ok && r.diagnostics[0].hint).toMatch(/public.*5 minutes/)
  })
  it('suggests the inner folder for local sources', async () => {
    const f = Object.assign(new File(['{}'], 'manifest.json'), { webkitRelativePath: 'repo/course/manifest.json' })
    const r = await loadQuiz(LocalFolderSource.fromFileList([f]))
    expect(!r.ok && r.diagnostics[0].hint).toContain('pick "course"')
  })
  it('fails clearly on bad manifest JSON and schema errors', async () => {
    const bad = await loadQuiz(src({ 'manifest.json': '{nope' }))
    expect(!bad.ok && bad.diagnostics[0]).toMatchObject({ file: 'manifest.json', message: expect.stringContaining('invalid JSON') })
    const schema = await loadQuiz(src({ 'manifest.json': { title: 'x' } }))
    expect(!schema.ok && schema.diagnostics.map((d) => d.message)).toContain('missing required field "questions"')
  })

  it('skips invalid questions, keeps the rest and pinpoints the problem', async () => {
    const r = await loadQuiz(src({
      'manifest.json': manifest,
      'q1.json': [mcq('good'), mcq('bad-topic', { topic: 'zzz' }), { ...mcq('typo'), explaination: 'x' }, mcq('two-right', { options: [{ text: 'a', correct: true }, { text: 'b', correct: true }] }), 7],
      'q2.jsonl': JSON.stringify(mcq('fine')) + '\n{broken\n' + JSON.stringify(mcq('good')) + '\n',
    }))
    if (!r.ok) throw new Error('should load')
    expect(r.quiz.questions.map((q) => q.id)).toEqual(['good', 'fine'])
    expect(r.quiz.skipped).toBe(6)
    const d = r.quiz.diagnostics
    expect(d.find((x) => x.id === 'bad-topic')).toMatchObject({ file: 'q1.json', index: 1, path: '/topic', hint: 'declared topics: a, b' })
    expect(d.find((x) => x.id === 'typo')).toMatchObject({ file: 'q1.json', index: 2, message: 'unknown field "explaination"', hint: 'did you mean "explanation"?' })
    expect(d.find((x) => x.id === 'two-right')?.message).toContain('exactly one correct')
    expect(d.find((x) => x.file === 'q1.json' && x.index === 4)?.message).toContain('JSON object')
    expect(d.find((x) => x.file === 'q2.jsonl' && x.line === 2)?.message).toContain('not valid JSON')
    expect(d.find((x) => x.file === 'q2.jsonl' && x.line === 3)).toMatchObject({ id: 'good', message: expect.stringContaining('duplicate question id') })
  })

  it('a missing question file does not sink the quiz', async () => {
    const r = await loadQuiz(src({ 'manifest.json': manifest, 'q1.json': [mcq('one')] }))
    if (!r.ok) throw new Error()
    expect(r.quiz.questions).toHaveLength(1)
    expect(r.quiz.diagnostics[0]).toMatchObject({ severity: 'error', file: 'q2.jsonl', message: expect.stringContaining('not found') })
  })
  it('fails when nothing valid remains', async () => {
    const r = await loadQuiz(src({ 'manifest.json': manifest, 'q1.json': [{ type: 'mcq' }], 'q2.jsonl': '' }))
    expect(r.ok).toBe(false)
    expect(!r.ok && r.diagnostics.at(-1)?.message).toContain('no valid questions')
  })
  it('rejects non-array .json files and paths outside the folder', async () => {
    const r = await loadQuiz(src({ 'manifest.json': { ...manifest, questions: ['q1.json', '../evil.json', 'q2.jsonl'] }, 'q1.json': mcq('x'), 'q2.jsonl': JSON.stringify(mcq('ok')) }))
    if (!r.ok) throw new Error()
    const msgs = r.quiz.diagnostics.map((d) => d.message)
    expect(msgs.some((m) => m.includes('JSON array'))).toBe(true)
    expect(msgs.some((m) => m.includes('inside the quiz folder'))).toBe(true)
  })

  it('degrades gracefully when reference or theme are broken', async () => {
    const r = await loadQuiz(src({
      'manifest.json': { ...manifest, reference: 'ref.json', theme: 'missing.json' },
      'q1.json': [mcq('one')], 'q2.jsonl': '', 'ref.json': { entries: [{ name: 'x' }] },
    }))
    if (!r.ok) throw new Error()
    expect(r.quiz.reference).toBeUndefined()
    expect(r.quiz.theme).toBeUndefined()
    const w = r.quiz.diagnostics.filter((d) => d.file === 'ref.json' || d.file === 'missing.json')
    expect(w).toHaveLength(2)
    expect(w.every((d) => d.severity === 'warning')).toBe(true)
  })
  it('accepts reference entries and inline themes', async () => {
    const r = await loadQuiz(src({
      'manifest.json': { ...manifest, reference: 'ref.json', theme: { scheme: 'light', accent: '#cc3300' } },
      'q1.json': [mcq('one')], 'q2.jsonl': '', 'ref.json': { entries: [{ name: 'f', summary: 's' }] },
    }))
    if (!r.ok) throw new Error()
    expect(r.quiz.reference).toMatchObject({ kind: 'entries', entries: [{ name: 'f' }] })
    expect(r.quiz.theme?.vars['color-scheme']).toBe('light')
  })
  it('warns about images missing from sources that can list files', async () => {
    const r = await loadQuiz(src({
      'manifest.json': { ...manifest, questions: ['q1.json'] },
      'q1.json': [mcq('one', { prompt: '![a](assets/here.png) ![b](assets/gone.png)' })], 'assets/here.png': 'x',
    }))
    if (!r.ok) throw new Error()
    expect(r.quiz.questions).toHaveLength(1)
    expect(r.quiz.diagnostics).toEqual([expect.objectContaining({ severity: 'warning', id: 'one', message: 'image "assets/gone.png" not found in the quiz folder' })])
  })
})

describe('parseQuestionFile', () => {
  it('numbers jsonl lines from 1 and counts items without blanks', () => {
    const { items, diagnostics } = parseQuestionFile('{"a":1}\n\n{"b":2}', 'f.jsonl')
    expect(items.map((i) => [i.index, i.line])).toEqual([[0, 1], [1, 3]])
    expect(diagnostics).toEqual([])
  })
})
