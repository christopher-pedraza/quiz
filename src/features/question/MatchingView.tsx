import type { MatchingInstance } from '../../core/question-types/matching.ts'
import { Markdown } from '../../ui/Markdown.tsx'
import type { ViewProps } from './types.ts'

export function MatchingView({ inst, answer, onChange, locked, result }: ViewProps<MatchingInstance, { type: 'matching'; chosen: (string | null)[] }>) {
  const pairs = inst.question.pairs
  const verdicts = (result?.detail.pairs ?? []) as boolean[]
  const set = (i: number, v: string) => {
    const chosen = pairs.map((_, k) => answer.chosen[k] ?? null)
    chosen[i] = v === '' ? null : v
    onChange({ ...answer, chosen })
  }
  return (
    <div>
      <p className="muted" style={{ margin: '0 0 0.5rem' }}>
        Choose the match for each item. The same choice can be used more than once.
      </p>
      {pairs.map((p, i) => (
        <div key={i} className="match-row">
          <div className="left">
            <Markdown text={p.left} inline />
          </div>
          <div>
            <select aria-label={`Match for ${p.left}`} className={result ? (verdicts[i] ? 'ok' : 'bad') : ''} value={answer.chosen[i] ?? ''} disabled={locked} onChange={(e) => set(i, e.target.value)}>
              <option value="">— choose —</option>
              {inst.rightOptions.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
            {result && !verdicts[i] && <div className="blank-answer">→ {p.right}</div>}
          </div>
        </div>
      ))}
    </div>
  )
}
