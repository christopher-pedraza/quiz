// @vitest-environment jsdom
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { readFolder } from '../../scripts/folder.ts'
import { renderMarkdown } from './content/render.ts'
import { loadQuiz } from './load/loadQuiz.ts'
import { MemorySource } from './source/memory.ts'

function strings(v: unknown, out: string[] = []): string[] {
  if (typeof v === 'string') out.push(v)
  else if (Array.isArray(v)) v.forEach((x) => strings(x, out))
  else if (v && typeof v === 'object') Object.values(v).forEach((x) => strings(x, out))
  return out
}

describe('bundled demo quiz: rendering', () => {
  it('every string renders without KaTeX errors or leftover scripts, and the image resolves against the source', async () => {
    const source = new MemorySource(readFolder(join(process.cwd(), 'public/samples/demo')))
    const r = await loadQuiz(source)
    if (!r.ok) throw new Error('demo failed to load')
    let sawImage = false
    for (const q of r.quiz.questions) {
      for (const s of strings(q)) {
        const html = renderMarkdown(s, { source })
        expect(html, `${q.id}: ${s.slice(0, 60)}`).not.toContain('katex-error')
        expect(html).not.toMatch(/<script/i)
        if (html.includes('memory-asset://assets/relu.svg')) sawImage = true
      }
    }
    expect(sawImage).toBe(true)
  })
})
