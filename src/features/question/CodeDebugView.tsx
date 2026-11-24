import { useMemo } from 'react'
import { highlightCode } from '../../core/content/render.ts'
import type { CodeDebugInstance } from '../../core/question-types/codeDebug.ts'
import { makeRng, shuffled } from '../../core/random.ts'
import { Markdown } from '../../ui/Markdown.tsx'
import type { ViewProps } from './types.ts'

type Props = ViewProps<CodeDebugInstance, { type: 'code-debug'; marked: number[]; fixes: Record<number, string> }>

export function CodeDebugView({ inst, answer, onChange, locked, result }: Props) {
  const q = inst.question
  const lines = q.code.split('\n')
  const verdicts = (result?.detail.verdicts ?? {}) as Record<number, string>
  const missed = new Set((result?.detail.missed ?? []) as number[])
  const reveal = result !== undefined
  // Offering options only on the real bug lines would give them away, so options are used only when EVERY bug has
  // them, and then every flagged line gets the same pooled list.
  const pool = useMemo(() => {
    if (!q.errors.every((e) => e.options)) return null
    return shuffled([...new Set(q.errors.flatMap((e) => e.options!))], makeRng(inst.seed))
  }, [q.errors, inst.seed])
  const html = useMemo(() => lines.map((l) => highlightCode(l, q.language)), [q.code, q.language]) // eslint-disable-line react-hooks/exhaustive-deps

  const toggle = (n: number) => {
    const marked = answer.marked.includes(n) ? answer.marked.filter((x) => x !== n) : [...answer.marked, n]
    onChange({ ...answer, marked })
  }
  const setFix = (n: number, v: string) => onChange({ ...answer, fixes: { ...answer.fixes, [n]: v } })

  return (
    <div>
      <p className="muted" style={{ margin: '0 0 0.5rem' }}>
        Click every line that contains a bug, then give the corrected line.
      </p>
      <div className="codebox" role="group" aria-label="Code to debug">
        {lines.map((_, i) => {
          const n = i + 1
          const on = answer.marked.includes(n)
          const v = verdicts[n]
          const state = reveal ? (v === 'correct' ? 'ok' : v ? 'bad' : missed.has(n) ? 'missed' : '') : ''
          return (
            <div key={n}>
              <button type="button" className={`code-line ${state}`} aria-pressed={on} aria-label={`Line ${n}`} disabled={locked} onClick={() => toggle(n)}>
                <span className="ln">{n}</span>
                <span dangerouslySetInnerHTML={{ __html: html[i] || ' ' }} />
              </button>
              {on && (
                <div className="fix-row">
                  <span className="muted">Fix for line {n}:</span>
                  {pool ? (
                    <select aria-label={`Fix for line ${n}`} value={answer.fixes[n] ?? ''} disabled={locked} onChange={(e) => setFix(n, e.target.value)}>
                      <option value="">— choose —</option>
                      {pool.map((o) => (
                        <option key={o} value={o}>
                          {o}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input type="text" aria-label={`Fix for line ${n}`} value={answer.fixes[n] ?? ''} disabled={locked} autoComplete="off" spellCheck={false} onChange={(e) => setFix(n, e.target.value)} />
                  )}
                  {v === 'not-an-error' && <span className="chip bad">no bug on this line</span>}
                  {v === 'wrong-fix' && <span className="chip bad">bug found, fix not accepted</span>}
                  {v === 'correct' && <span className="chip ok">correct</span>}
                </div>
              )}
            </div>
          )
        })}
      </div>
      {reveal && (
        <div className="explanation" style={{ marginTop: '0.8rem' }}>
          <strong>The bugs</strong>
          <ul style={{ margin: '0.4rem 0 0', paddingLeft: '1.2rem' }}>
            {q.errors.map((e) => (
              <li key={e.line}>
                <strong>Line {e.line}</strong>: <code>{e.fixes[0]}</code>
                {e.explanation && (
                  <>
                    {' '}
                    <Markdown text={e.explanation} inline />
                  </>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
