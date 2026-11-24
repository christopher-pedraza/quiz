import { render } from '@testing-library/react'
import type { ReactElement } from 'react'
import { loadQuiz } from '../core/load/loadQuiz.ts'
import { MemorySource } from '../core/source/memory.ts'
import type { KV } from '../core/storage/store.ts'
import { QuizProvider } from './QuizContext.tsx'
import { ToastProvider } from '../ui/Toast.tsx'
import type { SourceSpec } from '../core/source/types.ts'

export const memoryKv = (): KV & { data: Map<string, string> } => {
  const data = new Map<string, string>()
  return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v), removeItem: (k) => void data.delete(k) }
}

export const mcq = (id: string, topic: string, extra: object = {}) => ({
  type: 'mcq', id, topic, title: `Title ${id}`, prompt: `Prompt ${id}`, options: [{ text: `right ${id}`, correct: true, explanation: 'because' }, { text: `wrong ${id}`, correct: false }], ...extra,
})

/** Loads a quiz from in-memory files and renders `ui(quiz)` inside the providers. */
export async function renderQuiz(files: Record<string, unknown>, ui: ReactElement, opts: { kv?: ReturnType<typeof memoryKv>; spec?: SourceSpec } = {}) {
  const text = Object.fromEntries(Object.entries(files).map(([k, v]) => [k, typeof v === 'string' ? v : JSON.stringify(v)]))
  const r = await loadQuiz(new MemorySource(text, 'memory:testkit'))
  if (!r.ok) throw new Error(JSON.stringify(r.diagnostics))
  const kv = opts.kv ?? memoryKv()
  return { kv, quiz: r.quiz, ...render(<ToastProvider><QuizProvider quiz={r.quiz} kv={kv} spec={opts.spec}>{ui}</QuizProvider></ToastProvider>) }
}

export const manifest = (extra: object = {}) => ({ title: 'Test quiz', description: 'D', topics: [{ id: 'a', title: 'Alpha' }, { id: 'b', title: 'Beta' }], questions: ['q.json'], ...extra })
