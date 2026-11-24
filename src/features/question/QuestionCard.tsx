import type { ReactNode } from 'react'
import { QUESTION_TYPES, type Answer, type GradeResult } from '../../core/model/types.ts'
import type { Instance } from '../../core/question-types/index.ts'
import { Markdown } from '../../ui/Markdown.tsx'
import { CalculationView } from './CalculationView.tsx'
import { CategorizeView } from './CategorizeView.tsx'
import { McqView, MultiSelectView } from './ChoiceViews.tsx'
import { CodeDebugView } from './CodeDebugView.tsx'
import { FillBlankView } from './FillBlankView.tsx'
import { MatchingView } from './MatchingView.tsx'
import { OrderingView } from './OrderingView.tsx'
import { ShortAnswerView } from './ShortAnswerView.tsx'

export type CardMode = 'practice' | 'exam' | 'review'

interface Props {
  inst: Instance
  answer: Answer
  onAnswer(a: Answer): void
  mode: CardMode
  /** Present = feedback is shown. Never pass it in exam mode. */
  result?: GradeResult
  topicTitle: string
  flagged: boolean
  onFlag(): void
  onCheck?(): void
  onRetry?(): void
  /** Forget the stored result (status) of this question. */
  onForget?(): void
  /** Re-rolls random numbers / sampled options. */
  onReroll?: () => void
  rerollLabel?: string
  hintsShown?: number
  onHint?(): void
  onOpenReference?(name: string): void
  /** Extra header content, e.g. "3 / 40". */
  position?: ReactNode
}

function Body({ inst, answer, onAnswer, locked, result }: { inst: Instance; answer: Answer; onAnswer(a: Answer): void; locked: boolean; result?: GradeResult }) {
  const common = { locked, result, onChange: onAnswer as never }
  switch (inst.type) {
    case 'fill-blank':
      return <FillBlankView inst={inst} answer={answer as never} {...common} />
    case 'code-debug':
      return <CodeDebugView inst={inst} answer={answer as never} {...common} />
    case 'mcq':
      return <McqView inst={inst} answer={answer as never} {...common} />
    case 'multi-select':
      return <MultiSelectView inst={inst} answer={answer as never} {...common} />
    case 'calculation':
      return <CalculationView inst={inst} answer={answer as never} {...common} />
    case 'ordering':
      return <OrderingView inst={inst} answer={answer as never} {...common} />
    case 'matching':
      return <MatchingView inst={inst} answer={answer as never} {...common} />
    case 'categorize':
      return <CategorizeView inst={inst} answer={answer as never} {...common} />
    case 'short-answer':
      return <ShortAnswerView inst={inst} answer={answer as never} {...common} />
  }
}

export function verdictOf(r: GradeResult): { cls: string; text: string } {
  if (!r.graded) return { cls: 'info', text: 'Compare with the model answer, then grade yourself below.' }
  if (r.correct) return { cls: 'ok', text: 'Correct!' }
  if (r.score > 0) return { cls: 'partial', text: `Partly correct: ${Math.round(r.score * 100)}%` }
  return { cls: 'bad', text: 'Not quite.' }
}

export function QuestionCard(p: Props) {
  const q = p.inst.question
  const label = QUESTION_TYPES.find((t) => t.type === q.type)?.label ?? q.type
  const reveal = p.result !== undefined
  const hints = q.hints ?? []
  const shown = p.hintsShown ?? 0
  const locked = p.mode === 'review' || reveal
  return (
    <article className="card" aria-label={q.title ?? q.id}>
      <div className="q-head">
        <span className="chip accent">{label}</span>
        <span className="chip">{p.topicTitle}</span>
        {q.difficulty && <span className={`chip ${q.difficulty === 'easy' ? 'ok' : q.difficulty === 'hard' ? 'bad' : 'warn'}`}>{q.difficulty}</span>}
        {(q.points ?? 1) !== 1 && <span className="chip">{q.points} pts</span>}
        <span className="spacer" />
        {p.position}
        {p.mode !== 'review' && (
          <button className="btn small" aria-pressed={p.flagged} onClick={p.onFlag} title="Flag for review (f)">
            {p.flagged ? '⚑ Flagged' : '⚐ Flag'}
          </button>
        )}
      </div>
      {q.title && <h2 className="q-title">{q.title}</h2>}
      {q.prompt && <Markdown text={q.prompt} />}
      <div className="answer-area">
        <Body inst={p.inst} answer={p.answer} onAnswer={p.onAnswer} locked={locked} result={p.result} />
      </div>

      {p.mode === 'practice' && shown > 0 && (
        <div aria-label="Hints">
          {hints.slice(0, shown).map((h, i) => (
            <div key={i} className="hint">
              <strong>Hint {i + 1}:</strong> <Markdown text={h} inline />
            </div>
          ))}
        </div>
      )}

      {p.result && (
        <>
          <div className={`verdict ${verdictOf(p.result).cls}`} role="status">
            {verdictOf(p.result).text}
          </div>
          {q.explanation && (
            <div className="explanation">
              <strong>Explanation</strong>
              <Markdown text={q.explanation} />
            </div>
          )}
        </>
      )}

      {q.reference && q.reference.length > 0 && p.onOpenReference && p.mode !== 'exam' && (
        <div className="chips" style={{ marginTop: '0.8rem' }}>
          <span className="muted">Reference:</span>
          {q.reference.map((r) => (
            <button key={r} className="chip" onClick={() => p.onOpenReference!(r)}>
              {r}
            </button>
          ))}
        </div>
      )}

      {p.mode === 'practice' && (
        <div className="q-actions">
          {!reveal && (
            <button className="btn primary" onClick={p.onCheck}>
              Check answer
            </button>
          )}
          {reveal && (
            <button className="btn" onClick={p.onRetry}>
              Try again
            </button>
          )}
          {p.onForget && (
            <button className="btn ghost" onClick={p.onForget} title="Clear your saved result for this question">
              Forget my result
            </button>
          )}
          {p.onReroll && (
            <button className="btn" onClick={p.onReroll}>
              🎲 {p.rerollLabel ?? 'New numbers'}
            </button>
          )}
          {!reveal && hints.length > 0 && shown < hints.length && (
            <button className="btn ghost" onClick={p.onHint}>
              Hint ({shown}/{hints.length})
            </button>
          )}
        </div>
      )}
    </article>
  )
}
