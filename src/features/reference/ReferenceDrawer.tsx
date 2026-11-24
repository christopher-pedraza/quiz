import { useEffect, useMemo, useRef, useState } from 'react'
import type { Reference, ReferenceEntry } from '../../core/model/types.ts'
import { Drawer } from '../../ui/Drawer.tsx'
import { Markdown } from '../../ui/Markdown.tsx'

const matches = (e: ReferenceEntry, q: string) => [e.name, ...(e.aliases ?? []), e.summary, ...(e.tags ?? []), e.module ?? '', e.kind ?? ''].join('\n').toLowerCase().includes(q)

function Entry({ e, focus, onSee }: { e: ReferenceEntry; focus: boolean; onSee(name: string): void }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (focus) ref.current?.scrollIntoView?.({ block: 'start' })
  }, [focus])
  return (
    <div ref={ref} className={`ref-entry ${focus ? 'focus' : ''}`} id={`ref-${e.name}`}>
      <h3>{e.name}</h3>
      <div className="chips" style={{ margin: '0.3rem 0' }}>
        {e.kind && <span className="chip">{e.kind}</span>}
        {e.module && <span className="chip">{e.module}</span>}
        {e.aliases?.map((a) => (
          <span key={a} className="chip">
            {a}
          </span>
        ))}
      </div>
      {e.signature && <pre className="codebox" style={{ margin: '0.4rem 0' }}>{e.signature}</pre>}
      <Markdown text={e.summary} />
      {e.parameters && e.parameters.length > 0 && (
        <ul>
          {e.parameters.map((p) => (
            <li key={p.name}>
              <code>{p.name}</code>
              {p.type && <span className="muted"> : {p.type}</span>}
              {p.default !== undefined && <span className="muted"> = {p.default}</span>} — <Markdown text={p.description} inline />
            </li>
          ))}
        </ul>
      )}
      {e.returns && (
        <p>
          <strong>Returns:</strong> <Markdown text={e.returns} inline />
        </p>
      )}
      {e.example && <pre className="codebox">{e.example}</pre>}
      {e.notes?.map((n, i) => (
        <p key={i} className="muted">
          ⚠ <Markdown text={n} inline />
        </p>
      ))}
      {e.see_also && e.see_also.length > 0 && (
        <div className="chips">
          <span className="muted">See also:</span>
          {e.see_also.map((s) => (
            <button key={s} className="chip" onClick={() => onSee(s)}>
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function Entries({ entries, focus, setFocus }: { entries: ReferenceEntry[]; focus?: string; setFocus(n: string): void }) {
  const [query, setQuery] = useState('')
  const q = query.trim().toLowerCase()
  const findEntry = (name: string) => entries.find((e) => e.name === name || e.aliases?.includes(name))
  const shown = useMemo(() => (q ? entries.filter((e) => matches(e, q)) : entries), [entries, q])
  const target = focus ? findEntry(focus)?.name : undefined
  return (
    <>
      <input type="search" aria-label="Search the reference" placeholder={`Search ${entries.length} entries…`} style={{ width: '100%', marginBottom: '0.5rem' }} value={query} onChange={(e) => setQuery(e.target.value)} />
      {focus && !target && <p className="muted">No reference entry named “{focus}”.</p>}
      {shown.length === 0 && <p className="muted">No entries match.</p>}
      {shown.map((e) => (
        <Entry
          key={e.name}
          e={e}
          focus={e.name === target}
          onSee={(n) => {
            setQuery('')
            setFocus(n)
          }}
        />
      ))}
    </>
  )
}

/** Markdown references are split at "## " headings so the search can show only the matching sections. */
function MarkdownRef({ text }: { text: string }) {
  const [query, setQuery] = useState('')
  const sections = useMemo(() => text.split(/^(?=#{1,2} )/m).filter((s) => s.trim()), [text])
  const title = (s: string) => /^#{1,2} (.+)$/m.exec(s)?.[1] ?? 'Introduction'
  const q = query.trim().toLowerCase()
  const shown = q ? sections.filter((s) => s.toLowerCase().includes(q)) : sections
  const root = useRef<HTMLDivElement>(null)
  return (
    <div ref={root}>
      <input type="search" aria-label="Search the reference" placeholder="Search…" style={{ width: '100%', marginBottom: '0.5rem' }} value={query} onChange={(e) => setQuery(e.target.value)} />
      <div className="toc">
        {sections.map((s, i) => (
          <button key={i} className="chip" onClick={() => { setQuery(''); setTimeout(() => root.current?.querySelector(`#sec-${i}`)?.scrollIntoView?.({ block: 'start' }), 0) }}>
            {title(s)}
          </button>
        ))}
      </div>
      {shown.length === 0 && <p className="muted">Nothing matches.</p>}
      {shown.map((s) => (
        <section key={sections.indexOf(s)} id={`sec-${sections.indexOf(s)}`}>
          <Markdown text={s} />
        </section>
      ))}
    </div>
  )
}

export function ReferenceDrawer({ reference, focus, onClose }: { reference: Reference; focus?: string; onClose(): void }) {
  const [f, setF] = useState(focus)
  useEffect(() => setF(focus), [focus])
  return (
    <Drawer title="Reference" onClose={onClose} initialFocus="input[type=search]">
      {reference.kind === 'markdown' ? <MarkdownRef text={reference.text} /> : <Entries entries={reference.entries} focus={f} setFocus={setF} />}
    </Drawer>
  )
}
