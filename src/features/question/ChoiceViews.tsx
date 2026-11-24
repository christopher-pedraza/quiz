import { useEffect } from 'react'
import type { McqInstance, MultiSelectInstance } from '../../core/question-types/choice.ts'
import { Markdown } from '../../ui/Markdown.tsx'
import type { ViewProps } from './types.ts'

interface ListProps {
  inst: McqInstance | MultiSelectInstance
  multi: boolean
  picked: number[]
  onPick(picked: number[]): void
  locked: boolean
  reveal: boolean
}

function ChoiceList({ inst, multi, picked, onPick, locked, reveal }: ListProps) {
  const options = inst.question.options
  const toggle = (orig: number) => {
    if (!multi) onPick([orig])
    else onPick(picked.includes(orig) ? picked.filter((x) => x !== orig) : [...picked, orig])
  }
  // 1-9 pick the n-th option shown.
  useEffect(() => {
    if (locked) return
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement
      if (e.ctrlKey || e.metaKey || e.altKey || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable) return
      const n = Number(e.key)
      if (n >= 1 && n <= inst.order.length) toggle(inst.order[n - 1])
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })
  return (
    <div role={multi ? 'group' : 'radiogroup'} aria-label={multi ? 'Select all that apply' : 'Choose one'}>
      {multi && <p className="muted" style={{ margin: '0 0 0.5rem' }}>Select all that apply.</p>}
      {inst.order.map((orig, shown) => {
        const o = options[orig]
        const on = picked.includes(orig)
        const state = !reveal ? '' : on && o.correct ? 'ok' : on ? 'bad' : o.correct ? 'missed' : ''
        return (
          <label key={orig} className={`opt ${state}`}>
            <input type={multi ? 'checkbox' : 'radio'} name={`${inst.question.id}-${inst.seed}`} checked={on} disabled={locked} onChange={() => toggle(orig)} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <Markdown text={o.text} inline />
              {reveal && o.explanation && (
                <div className="why">
                  {o.correct ? '✓ ' : on ? '✗ ' : ''}
                  <Markdown text={o.explanation} inline />
                </div>
              )}
            </div>
            {shown < 9 && (
              <span className="num" aria-hidden>
                {shown + 1}
              </span>
            )}
          </label>
        )
      })}
    </div>
  )
}

export function McqView({ inst, answer, onChange, locked, result }: ViewProps<McqInstance, { type: 'mcq'; picked: number | null }>) {
  return <ChoiceList inst={inst} multi={false} picked={answer.picked === null ? [] : [answer.picked]} onPick={(p) => onChange({ ...answer, picked: p[0] ?? null })} locked={locked} reveal={result !== undefined} />
}

export function MultiSelectView({ inst, answer, onChange, locked, result }: ViewProps<MultiSelectInstance, { type: 'multi-select'; picked: number[] }>) {
  return <ChoiceList inst={inst} multi picked={answer.picked} onPick={(p) => onChange({ ...answer, picked: p })} locked={locked} reveal={result !== undefined} />
}
