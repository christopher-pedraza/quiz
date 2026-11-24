import { Fragment, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import type { Blank } from '../../core/model/types.ts'
import { blankMode, BLANK_MARKER, type FillBlankInstance } from '../../core/question-types/index.ts'
import { Chip, ChipBoard, Target } from '../../ui/dnd.tsx'
import { useRenderedHtml } from '../../ui/Markdown.tsx'
import type { ViewProps } from './types.ts'

type Props = ViewProps<FillBlankInstance, { type: 'fill-blank'; values: Record<string, string> }>

/** Markdown prose in which each <<BLANK:id>> becomes a live widget, mounted into the rendered HTML through a portal. */
function ProseSlots({ template, render }: { template: string; render(id: string): ReactNode }) {
  const html = useRenderedHtml(template.replace(BLANK_MARKER, (_, id: string) => `<span data-slot="${id}"></span>`))
  const host = useRef<HTMLDivElement>(null)
  const [slots, setSlots] = useState<[string, Element][]>([])
  useLayoutEffect(() => {
    setSlots(Array.from(host.current!.querySelectorAll('[data-slot]')).map((el) => [el.getAttribute('data-slot')!, el]))
  }, [html])
  return (
    <>
      <div ref={host} className="md prose-slots" dangerouslySetInnerHTML={{ __html: html }} />
      {slots.map(([id, el]) => createPortal(render(id), el, id))}
    </>
  )
}

export function FillBlankView({ inst, answer, onChange, locked, result }: Props) {
  const q = inst.question
  const verdicts = (result?.detail.blanks ?? {}) as Record<string, boolean>
  const reveal = result !== undefined
  const set = (id: string, v: string) => onChange({ ...answer, values: { ...answer.values, [id]: v } })
  const byId = useMemo(() => new Map(q.blanks.map((b) => [b.id, b])), [q])
  const cls = (id: string) => (reveal ? (verdicts[id] ? 'ok' : 'bad') : '')

  // Drag mode: which bank chip sits in which blank, derived from the answer text so the answer stays a plain string map.
  const placed = useMemo(() => {
    const used = new Set<string>()
    const out: Record<string, { id: string; text: string }> = {}
    for (const b of q.blanks) {
      const v = answer.values[b.id]
      const chip = v ? inst.bank.find((c) => c.text === v && !used.has(c.id)) : undefined
      if (chip) {
        used.add(chip.id)
        out[b.id] = chip
      }
    }
    return out
  }, [answer.values, inst.bank, q.blanks])
  const inBank = inst.bank.filter((c) => !Object.values(placed).some((p) => p.id === c.id))
  const isCode = Boolean(q.language)

  const onPlace = (chipId: string, target: string) => {
    const chip = inst.bank.find((c) => c.id === chipId)
    if (!chip) return
    const values = { ...answer.values }
    for (const [blank, p] of Object.entries(placed)) if (p.id === chipId) delete values[blank]
    if (target.startsWith('slot:')) values[target.slice(5)] = chip.text
    onChange({ ...answer, values })
  }

  const correctHint = (b: Blank) => (reveal && !verdicts[b.id] ? <span className="blank-answer">→ {b.answers[0]}</span> : null)

  const widget = (id: string): ReactNode => {
    const b = byId.get(id)
    if (!b) return <code>{`<<BLANK:${id}>>`}</code>
    const mode = blankMode(q, b)
    const label = b.label ?? `Blank ${id}`
    if (mode === 'drag') {
      const chip = placed[id]
      return (
        <>
          <Target as="span" id={`slot:${id}`} label={label} className={`slot ${cls(id)}`}>
            {chip ? (
              <Chip id={chip.id} code={isCode} className={cls(id)}>
                {chip.text}
              </Chip>
            ) : (
              <span className="empty" />
            )}
          </Target>
          {correctHint(b)}
        </>
      )
    }
    if (mode === 'choice') {
      return (
        <>
          <select aria-label={label} className={cls(id)} value={answer.values[id] ?? ''} disabled={locked} onChange={(e) => set(id, e.target.value)}>
            <option value="">— choose —</option>
            {inst.choices[id].map((o) => (
              <option key={o.text} value={o.text}>
                {o.text}
              </option>
            ))}
          </select>
          {correctHint(b)}
        </>
      )
    }
    const width = Math.max(6, Math.min(40, Math.max(...b.answers.map((a) => a.length)) + 2))
    return (
      <>
        {b.multiline ? (
          <textarea aria-label={label} className={`blank-input ${cls(id)}`} rows={2} value={answer.values[id] ?? ''} disabled={locked} placeholder={b.placeholder} onChange={(e) => set(id, e.target.value)} />
        ) : (
          <input type="text" aria-label={label} className={`blank-input ${cls(id)}`} style={{ width: `${width}ch` }} value={answer.values[id] ?? ''} disabled={locked} placeholder={b.placeholder} autoComplete="off" autoCapitalize="off" spellCheck={false} onChange={(e) => set(id, e.target.value)} />
        )}
        {correctHint(b)}
      </>
    )
  }

  const body = isCode ? (
    <div className="codebox" role="group" aria-label="Code with blanks">
      {q.template.split('\n').map((line, i) => (
        <div key={i}>
          <span className="ln">{i + 1}</span>
          {line.split(/(<<BLANK:[A-Za-z0-9_.:-]+>>)/).map((part, j) => {
            const m = /^<<BLANK:([A-Za-z0-9_.:-]+)>>$/.exec(part)
            return m ? <Fragment key={j}>{widget(m[1])}</Fragment> : <Fragment key={j}>{part}</Fragment>
          })}
        </div>
      ))}
    </div>
  ) : (
    <ProseSlots template={q.template} render={widget} />
  )

  // Per-blank labels (the old "slot" labels): "what must this line do?"
  const labelled = q.blanks.filter((b) => b.label)

  const content = (
    <>
      {body}
      {labelled.length > 0 && (
        <ul className="muted" style={{ margin: '0.6rem 0 0', paddingLeft: '1.2rem' }}>
          {labelled.map((b) => (
            <li key={b.id}>
              <code>{b.id}</code>: {b.label}
            </li>
          ))}
        </ul>
      )}
    </>
  )
  if (q.mode !== 'drag') return content
  return (
    <ChipBoard onPlace={onPlace} disabled={locked}>
      {content}
      <p className="filter-label" style={{ margin: '1rem 0 0.3rem' }}>
        Word bank: drag a chip into a blank, or click it and then click a blank
      </p>
      <Target id="bank" label="Word bank" className="bank">
        {inBank.map((c) => (
          <Chip key={c.id} id={c.id} code={isCode}>
            {c.text}
          </Chip>
        ))}
      </Target>
    </ChipBoard>
  )
}
