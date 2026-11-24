import { useEffect, useReducer, useRef } from 'react'
import { statusKey } from '../../core/filter.ts'
import type { Answer, GradeResult, Question } from '../../core/model/types.ts'
import { blankMode, emptyAnswer, grade, instantiate, type Instance } from '../../core/question-types/index.ts'
import { newSeed } from '../../core/random.ts'
import { useQuiz } from '../../app/QuizContext.tsx'
import { QuestionCard } from '../question/QuestionCard.tsx'

interface Session {
  seed: number
  inst: Instance
  answer: Answer
  result?: GradeResult
  hints: number
}

interface Props {
  list: Question[]
  qid?: string
  navigate(qid: string, replace?: boolean): void
  openReference(name?: string): void
  /** Keyboard shortcuts are off while a drawer or dialog is open. */
  keysEnabled: boolean
  /** Where to start when the URL names no question. */
  startId?: string
  onVisit(qid: string): void
  /** Filters are active (they are remembered between visits, so an empty result needs a way out). */
  filtering: boolean
  onClearFilters(): void
}

/** What can be re-rolled for a question, if anything. */
export function rerollLabel(q: Question): string | undefined {
  if (q.type === 'calculation' && q.variables && Object.keys(q.variables).length > 0) return 'New numbers'
  if (q.type === 'fill-blank' && q.blanks.some((b) => blankMode(q, b) === 'choice' && !b.options && b.distractors)) return 'New options'
  return undefined
}

const typing = (t: EventTarget | null) => {
  const el = t as HTMLElement | null
  return !!el && (/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) || el.isContentEditable)
}

export function Practice({ list, qid, navigate, openReference, keysEnabled, startId, onVisit, filtering, onClearFilters }: Props) {
  const { quiz, byId, attempts, flags, record, toggleFlag, topicTitle, forget, epoch } = useQuiz()
  const sessions = useRef(new Map<string, Session>())
  const [, bump] = useReducer((x: number) => x + 1, 0)
  const q = qid ? byId.get(qid) : undefined
  // A reloaded quiz means new question objects: drop sessions built from the old ones. (Doing this in an effect would also
  // run after the very first render and orphan the session that render is already using.)
  const seen = useRef(quiz.questions)
  const seenEpoch = useRef(epoch)
  // Same for a progress reset: in-memory verdicts must not outlive the stored results they mirror.
  if (seen.current !== quiz.questions || seenEpoch.current !== epoch) {
    seen.current = quiz.questions
    seenEpoch.current = epoch
    sessions.current.clear()
  }

  useEffect(() => {
    if (q) onVisit(q.id)
    else {
      const first = (startId && byId.has(startId) ? startId : undefined) ?? list.find((x) => statusKey(x.id, { attempts }) === 'unanswered')?.id ?? list[0]?.id ?? quiz.questions[0].id
      navigate(first, true)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q?.id])

  const session = (question: Question): Session => {
    let s = sessions.current.get(question.id)
    if (!s) {
      const seed = newSeed()
      const inst = instantiate(question, seed)
      s = { seed, inst, answer: emptyAnswer(inst), hints: 0 }
      sessions.current.set(question.id, s)
    }
    return s
  }
  const s = q ? session(q) : undefined

  const idx = q ? list.findIndex((x) => x.id === q.id) : -1
  const go = (target?: Question) => target && navigate(target.id)
  const prev = idx > 0 ? list[idx - 1] : undefined
  const next = idx >= 0 && idx < list.length - 1 ? list[idx + 1] : idx < 0 ? list[0] : undefined
  const nextUnanswered = () => {
    const start = idx < 0 ? 0 : idx + 1
    for (let i = 0; i < list.length; i++) {
      const c = list[(start + i) % list.length]
      if (c.id !== q?.id && statusKey(c.id, { attempts }) === 'unanswered') return c
    }
    return undefined
  }

  const check = () => {
    if (!q || !s || s.result) return
    s.result = grade(s.inst, s.answer)
    record(q.id, s.result, s.seed)
    bump()
  }
  const retry = () => {
    if (!s) return
    s.answer = emptyAnswer(s.inst)
    s.result = undefined
    bump()
  }
  const reroll = () => {
    if (!q || !s) return
    s.seed = newSeed()
    s.inst = instantiate(q, s.seed)
    s.answer = emptyAnswer(s.inst)
    s.result = undefined
    bump()
  }
  const onAnswer = (a: Answer) => {
    if (!q || !s) return
    const wasGraded = s.answer.type === 'short-answer' && s.answer.selfGraded
    s.answer = a
    if (s.result && a.type === 'short-answer') {
      s.result = grade(s.inst, a)
      if (a.selfGraded && !wasGraded) record(q.id, s.result, s.seed)
    }
    bump()
  }
  const hint = () => {
    if (!s || !q) return
    s.hints = Math.min(s.hints + 1, q.hints?.length ?? 0)
    bump()
  }

  useEffect(() => {
    if (!keysEnabled || !q) return
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault()
        if (s?.result) retry()
        else check()
        return
      }
      if (e.ctrlKey || e.metaKey || e.altKey || typing(e.target)) return
      if (e.key === 'j' || e.key === 'ArrowRight') go(next)
      else if (e.key === 'k' || e.key === 'ArrowLeft') go(prev)
      else if (e.key === 'n') go(nextUnanswered())
      else if (e.key === 'f') toggleFlag(q.id)
      else if (e.key === 'h') hint()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  if (!q || !s) return null
  const done = list.filter((x) => statusKey(x.id, { attempts }) !== 'unanswered').length
  return (
    <div
      onKeyDown={(e) => {
        const t = e.target as HTMLInputElement
        if (e.key === 'Enter' && t.tagName === 'INPUT' && t.type === 'text' && !s.result) {
          e.preventDefault()
          check()
        }
      }}
    >
      <div className="nav-bar">
        <button className="btn" onClick={() => go(prev)} disabled={!prev} aria-label="Previous question (k)">
          ← Prev
        </button>
        <span aria-live="polite">
          {idx >= 0 ? `${idx + 1} / ${list.length}` : list.length ? `outside filter · ${list.length} in filter` : 'no question matches the filter'}
        </span>
        <button className="btn" onClick={() => go(next)} disabled={!next} aria-label="Next question (j)">
          Next →
        </button>
        <div className="progress" title={`${done} of ${list.length} answered`} role="progressbar" aria-valuemin={0} aria-valuemax={list.length} aria-valuenow={done}>
          <span style={{ width: `${list.length ? (done / list.length) * 100 : 0}%` }} />
        </div>
        <button className="btn ghost" onClick={() => go(nextUnanswered())} disabled={!nextUnanswered()} title="Jump to the next unanswered question (n)">
          Next unanswered
        </button>
      </div>
      {filtering && list.length === 0 && (
        <div className="banner warning" style={{ marginBottom: '1rem' }} role="alert">
          No question matches your filters (they are remembered between visits).{' '}
          <button className="btn small" onClick={onClearFilters}>
            Clear filters
          </button>
        </div>
      )}
      <QuestionCard
        key={`${q.id}:${s.seed}`}
        inst={s.inst}
        answer={s.answer}
        onAnswer={onAnswer}
        mode="practice"
        result={s.result}
        topicTitle={topicTitle(q.topic)}
        flagged={flags.has(q.id)}
        onFlag={() => toggleFlag(q.id)}
        onCheck={check}
        onRetry={retry}
        onReroll={rerollLabel(q) ? reroll : undefined}
        rerollLabel={rerollLabel(q)}
        hintsShown={s.hints}
        onHint={hint}
        onOpenReference={openReference}
        onForget={attempts[q.id] ? () => { forget(q.id); retry() } : undefined}
      />
    </div>
  )
}
