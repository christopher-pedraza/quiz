import type { CalculationInstance } from '../../core/question-types/index.ts'
import { formatValue } from '../../core/text/numeric.ts'
import { Markdown } from '../../ui/Markdown.tsx'
import { toleranceText } from './format.ts'
import type { ViewProps } from './types.ts'

export function CalculationView({ inst, answer, onChange, locked, result }: ViewProps<CalculationInstance, { type: 'calculation'; values: Record<string, string> }>) {
  const q = inst.question
  const verdicts = (result?.detail.parts ?? {}) as Record<string, boolean>
  return (
    <div>
      {q.code && <Markdown text={`\`\`\`${q.language ?? ''}\n${q.code}\n\`\`\``} />}
      <p className="muted" style={{ margin: '0.5rem 0 0' }}>
        Numbers or expressions are fine, e.g. <code>432*6+6</code> or <code>2,598</code>.
      </p>
      {q.parts.map((p) => {
        const state = result ? (verdicts[p.id] ? 'ok' : 'bad') : ''
        const tol = toleranceText(p.tolerance)
        return (
          <div key={p.id} className="calc-row">
            {p.label && <Markdown text={p.label} inline />}
            <input
              type="text"
              inputMode="decimal"
              aria-label={p.label ?? `Answer ${p.id}`}
              className={`blank-input ${state}`}
              value={answer.values[p.id] ?? ''}
              disabled={locked}
              autoComplete="off"
              spellCheck={false}
              onChange={(e) => onChange({ ...answer, values: { ...answer.values, [p.id]: e.target.value } })}
            />
            {p.unit && <Markdown text={p.unit} inline />}
            {result && (
              <span className="expected">
                {verdicts[p.id] ? <span className="chip ok">correct</span> : <span className="chip bad">expected {formatValue(p.value)}</span>}
                {tol && !verdicts[p.id] && <span className="muted"> ({tol} accepted)</span>}
              </span>
            )}
            {!result && tol && <span className="muted">({tol} accepted)</span>}
          </div>
        )
      })}
    </div>
  )
}
