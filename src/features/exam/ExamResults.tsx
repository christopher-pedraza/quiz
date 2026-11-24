import { useEffect, useMemo, useRef, useState } from 'react'
import { QUESTION_TYPES, type Answer } from '../../core/model/types.ts'
import type { Bucket } from '../../core/exam/score.ts'
import { grade } from '../../core/question-types/index.ts'
import { useQuiz } from '../../app/QuizContext.tsx'
import { QuestionCard } from '../question/QuestionCard.tsx'
import { gradeAll, scoresOf, type ExamOutcome } from './types.ts'

type Filter = 'all' | 'incorrect' | 'flagged' | 'unanswered'

const level = (pct: number) => (pct >= 80 ? 'high' : pct >= 50 ? 'mid' : 'low')

function Bars({ title, rows }: { title: string; rows: { label: string; b: Bucket }[] }) {
  return (
    <section className="card" aria-label={title}>
      <h3>{title}</h3>
      <div className="stack" style={{ gap: '0.6rem' }}>
        {rows.map(({ label, b }) => {
          const pct = b.possible ? (b.earned / b.possible) * 100 : 0
          return (
            <div key={label}>
              <div className="row">
                <span>{label}</span>
                <span className="spacer" />
                <span className="muted">
                  {Number(b.earned.toFixed(2))}/{Number(b.possible.toFixed(2))} · {Math.round(pct)}%
                </span>
              </div>
              <div className={`bar ${level(pct)}`} role="img" aria-label={`${label}: ${Math.round(pct)} percent`}>
                <span style={{ width: `${pct}%` }} />
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}

export function ExamResults({ outcome, onNewExam, onPracticeMissed }: { outcome: ExamOutcome; onNewExam(): void; onPracticeMissed(): void }) {
  const { store, topicTitle } = useQuiz()
  const [answers, setAnswers] = useState<Record<string, Answer>>(outcome.answers)
  const [filter, setFilter] = useState<Filter>('all')
  const { questions, instances } = outcome
  const { grades, score } = useMemo(() => gradeAll(questions, instances, answers), [questions, instances, answers])
  const flagged = new Set(outcome.flags)

  // Self-graded short answers change the score: keep the saved history entry in step.
  const first = useRef(true)
  useEffect(() => {
    if (first.current) {
      first.current = false
      return
    }
    store.updateExam({ ...outcome.result, ...score, scores: scoresOf(questions, grades) })
  }, [score]) // eslint-disable-line react-hooks/exhaustive-deps

  const typeLabel = (t: string) => QUESTION_TYPES.find((x) => x.type === t)?.label ?? t
  const kind = (id: string): 'unanswered' | 'pending' | 'correct' | 'partial' | 'incorrect' => {
    const g = grades[id]
    return !g ? 'unanswered' : !g.graded ? 'pending' : g.correct ? 'correct' : g.score > 0 ? 'partial' : 'incorrect'
  }
  const shown = questions.filter((q) => {
    const k = kind(q.id)
    return filter === 'all' || (filter === 'flagged' ? flagged.has(q.id) : filter === 'unanswered' ? k === 'unanswered' : k === 'incorrect' || k === 'partial' || k === 'unanswered')
  })
  const missed = questions.some((q) => kind(q.id) !== 'correct')
  const mins = Math.floor(outcome.result.seconds / 60)
  return (
    <div className="stack">
      <section className="card">
        <div className="row" style={{ gap: '2rem' }}>
          <div>
            <div className="score-big" aria-label={`Score ${Math.round(score.percent)} percent`}>
              {Math.round(score.percent)}%
            </div>
            <div className="muted">
              {Number(score.earned.toFixed(2))} of {Number(score.possible.toFixed(2))} points
            </div>
          </div>
          <div className="muted">
            <div>{questions.length} questions · {mins}m {outcome.result.seconds % 60}s</div>
            <div>{score.unanswered} unanswered{flagged.size ? ` · ${flagged.size} flagged` : ''}</div>
            {score.pending > 0 && <div className="chip warn">{score.pending} short answer(s) waiting for your self-grade (not counted yet)</div>}
          </div>
          <span className="spacer" />
          <button className="btn primary" onClick={onNewExam}>
            New exam
          </button>
          {missed && (
            <button className="btn" onClick={onPracticeMissed}>
              Practice what I missed
            </button>
          )}
        </div>
      </section>
      <div className="row" style={{ alignItems: 'stretch' }}>
        <div style={{ flex: 1, minWidth: '16rem' }}>
          <Bars title="Score by topic" rows={Object.entries(score.byTopic).map(([k, b]) => ({ label: topicTitle(k), b }))} />
        </div>
        <div style={{ flex: 1, minWidth: '16rem' }}>
          <Bars title="Score by question type" rows={Object.entries(score.byType).map(([k, b]) => ({ label: typeLabel(k), b }))} />
        </div>
      </div>
      <section aria-label="Review">
        <div className="row" style={{ marginBottom: '0.75rem' }}>
          <h2 style={{ margin: 0 }}>Review</h2>
          <span className="spacer" />
          {(['all', 'incorrect', 'flagged', 'unanswered'] as Filter[]).map((f) => (
            <button key={f} className="chip" aria-pressed={filter === f} onClick={() => setFilter(f)}>
              {f === 'incorrect' ? 'Not fully correct' : f[0].toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>
        {shown.length === 0 && <p className="muted">Nothing to show here.</p>}
        {shown.map((q) => {
          const k = kind(q.id)
          const n = questions.indexOf(q) + 1
          return (
            <details key={q.id} className="card" open={k === 'pending'}>
              <summary style={{ cursor: 'pointer' }}>
                <strong>{n}.</strong> {q.title ?? q.id}{' '}
                <span className={`chip ${k === 'correct' ? 'ok' : k === 'partial' || k === 'pending' ? 'warn' : 'bad'}`}>{k === 'partial' ? `${Math.round(grades[q.id]!.score * 100)}%` : k}</span>
                {flagged.has(q.id) && <span className="chip warn"> ⚑ flagged</span>}
              </summary>
              <div style={{ marginTop: '0.8rem' }}>
                <QuestionCard
                  inst={instances[q.id]}
                  answer={answers[q.id]}
                  onAnswer={(a) => setAnswers((s) => ({ ...s, [q.id]: a }))}
                  mode="review"
                  // Unanswered questions are shown with their solution; the grade is only used for display.
                  result={grades[q.id] ?? grade(instances[q.id], answers[q.id])}
                  topicTitle={topicTitle(q.topic)}
                  flagged={flagged.has(q.id)}
                  onFlag={() => {}}
                />
              </div>
            </details>
          )
        })}
      </section>
    </div>
  )
}
