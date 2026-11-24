import type { Difficulty, Question, QuestionType, TopicDef } from './model/types.ts'
import { statusOf, type Attempt } from './storage/store.ts'

export type StatusFilter = 'unanswered' | 'incorrect' | 'correct' | 'flagged'

export interface Filters {
  query: string
  topics: string[]
  types: QuestionType[]
  difficulties: Difficulty[]
  /** Any of: matches questions in at least one of these states. Empty = all. */
  statuses: StatusFilter[]
}

export const EMPTY_FILTERS: Filters = { query: '', topics: [], types: [], difficulties: [], statuses: [] }

export const isFiltering = (f: Filters) => f.query.trim() !== '' || f.topics.length > 0 || f.types.length > 0 || f.difficulties.length > 0 || f.statuses.length > 0

export interface FilterContext {
  attempts: Readonly<Record<string, Attempt>>
  flags: ReadonlySet<string>
  topics: readonly TopicDef[]
}

/** The state of a question for filtering: a pending self-grade counts as not answered yet. */
export function statusKey(id: string, ctx: Pick<FilterContext, 'attempts'>): 'unanswered' | 'incorrect' | 'correct' {
  const s = statusOf(ctx.attempts[id])
  return s === 'pending' ? 'unanswered' : s
}

/** Keeps the bank's order. Every whitespace-separated word of the query must appear in the title, id, tags, topic or prompt. */
export function filterQuestions(questions: readonly Question[], f: Filters, ctx: FilterContext): Question[] {
  const words = f.query.toLowerCase().split(/\s+/).filter(Boolean)
  const topicTitle = new Map(ctx.topics.map((t) => [t.id, t.title]))
  return questions.filter((q) => {
    if (f.topics.length && !f.topics.includes(q.topic)) return false
    if (f.types.length && !f.types.includes(q.type)) return false
    if (f.difficulties.length && !(q.difficulty && f.difficulties.includes(q.difficulty))) return false
    if (f.statuses.length) {
      const key = statusKey(q.id, ctx)
      if (!f.statuses.some((s) => (s === 'flagged' ? ctx.flags.has(q.id) : s === key))) return false
    }
    if (words.length) {
      const hay = [q.id, q.title, q.prompt, topicTitle.get(q.topic), ...(q.tags ?? [])].filter(Boolean).join('\n').toLowerCase()
      if (!words.every((w) => hay.includes(w))) return false
    }
    return true
  })
}
