import type { ShortAnswerInstance } from '../../core/question-types/shortAnswer.ts'
import { Markdown } from '../../ui/Markdown.tsx'
import type { ViewProps } from './types.ts'

type A = { type: 'short-answer'; text: string; checked: number[]; selfGraded: boolean }

export function ShortAnswerView({ inst, answer, onChange, locked, result }: ViewProps<ShortAnswerInstance, A>) {
  const q = inst.question
  const reveal = result !== undefined
  const grading = reveal && !answer.selfGraded
  const toggle = (i: number) => onChange({ ...answer, checked: answer.checked.includes(i) ? answer.checked.filter((x) => x !== i) : [...answer.checked, i] })
  return (
    <div>
      <textarea aria-label="Your answer" value={answer.text} disabled={locked || reveal} placeholder="Write your answer here…" onChange={(e) => onChange({ ...answer, text: e.target.value })} />
      {reveal && (
        <div className="stack" style={{ marginTop: '1rem' }}>
          <div className="explanation">
            <strong>Model answer</strong>
            <Markdown text={q.modelAnswer} />
          </div>
          <div className="rubric">
            <strong>{grading ? 'Tick what your answer covered' : 'Your self-assessment'}</strong>
            {q.rubric.map((r, i) => (
              <label key={i}>
                <input type="checkbox" checked={answer.checked.includes(i)} disabled={!grading} onChange={() => toggle(i)} />
                <span>
                  <Markdown text={r.text} inline />
                  {r.points !== undefined && r.points !== 1 && <span className="muted"> ({r.points} pt)</span>}
                </span>
              </label>
            ))}
            {grading && (
              <button className="btn primary" style={{ marginTop: '0.5rem' }} onClick={() => onChange({ ...answer, selfGraded: true })}>
                Save my grade
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
