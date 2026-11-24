import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import type { GradeResult, Question } from '../core/model/types.ts'
import type { LoadedQuiz } from '../core/load/loadQuiz.ts'
import type { SourceSpec } from '../core/source/types.ts'
import { QuizStore, type Attempt, type KV } from '../core/storage/store.ts'
import { SourceContext } from '../ui/Markdown.tsx'

export interface QuizCtx {
  quiz: LoadedQuiz
  spec?: SourceSpec
  store: QuizStore
  attempts: Record<string, Attempt>
  flags: ReadonlySet<string>
  byId: ReadonlyMap<string, Question>
  topicTitle(id: string): string
  record(id: string, result: GradeResult, seed: number): void
  toggleFlag(id: string): boolean
  setFlag(id: string, on: boolean): void
  /** Forget the stored result of one question. */
  forget(id: string): void
  /** Clears the chosen kinds of saved progress for this quiz only. */
  resetProgress(what: { attempts?: boolean; flags?: boolean; exams?: boolean }): void
  /** Bumps on every reset so screens holding in-memory results (practice sessions) can drop them. */
  epoch: number
}

const Ctx = createContext<QuizCtx | undefined>(undefined)
export const useQuiz = (): QuizCtx => {
  const c = useContext(Ctx)
  if (!c) throw new Error('useQuiz outside <QuizProvider>')
  return c
}

export function QuizProvider({ quiz, spec, kv, children }: { quiz: LoadedQuiz; spec?: SourceSpec; kv: KV; children: ReactNode }) {
  const store = useMemo(() => new QuizStore(kv, quiz.source.slug), [kv, quiz.source.slug])
  const [attempts, setAttempts] = useState(() => store.attempts())
  const [flags, setFlags] = useState<ReadonlySet<string>>(() => store.flags())
  const [epoch, setEpoch] = useState(0)
  const byId = useMemo(() => new Map(quiz.questions.map((q) => [q.id, q])), [quiz.questions])
  const titles = useMemo(() => new Map(quiz.manifest.topics.map((t) => [t.id, t.title])), [quiz.manifest.topics])
  const record = useCallback(
    (id: string, result: GradeResult, seed: number) => {
      store.recordAttempt(id, result.score, { seed, pending: !result.graded })
      setAttempts(store.attempts())
    },
    [store],
  )
  const toggleFlag = useCallback(
    (id: string) => {
      const now = store.toggleFlag(id)
      setFlags(store.flags())
      return now
    },
    [store],
  )
  const setFlag = useCallback(
    (id: string, on: boolean) => {
      if (store.flags().has(id) !== on) toggleFlag(id)
    },
    [store, toggleFlag],
  )
  const forget = useCallback(
    (id: string) => {
      store.clearAttempt(id)
      setAttempts(store.attempts())
    },
    [store],
  )
  const resetProgress = useCallback(
    (what: { attempts?: boolean; flags?: boolean; exams?: boolean }) => {
      if (what.attempts) store.clearAttempts()
      if (what.flags) store.clearFlags()
      if (what.exams) store.clearExams()
      setAttempts(store.attempts())
      setFlags(store.flags())
      setEpoch((e) => e + 1)
    },
    [store],
  )
  const value: QuizCtx = { quiz, spec, store, attempts, flags, byId, topicTitle: (id) => titles.get(id) ?? id, record, toggleFlag, setFlag, forget, resetProgress, epoch }
  return (
    <Ctx.Provider value={value}>
      <SourceContext.Provider value={quiz.source}>{children}</SourceContext.Provider>
    </Ctx.Provider>
  )
}
