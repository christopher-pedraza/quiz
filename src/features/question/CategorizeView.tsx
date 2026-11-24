import type { CategorizeInstance } from '../../core/question-types/categorize.ts'
import { Chip, ChipBoard, Target } from '../../ui/dnd.tsx'
import type { ViewProps } from './types.ts'

export function CategorizeView({ inst, answer, onChange, locked, result }: ViewProps<CategorizeInstance, { type: 'categorize'; placed: Record<string, string | null> }>) {
  const q = inst.question
  const home = new Map(q.categories.flatMap((c) => c.items.map((i) => [i, c] as const)))
  const catOf = (chip: string) => answer.placed[chip] ?? null
  const inPool = inst.pool.filter((c) => catOf(c) === null)
  const onPlace = (chip: string, target: string) => {
    const next = { ...answer.placed }
    if (target === 'pool') delete next[chip]
    else if (target.startsWith('cat:')) next[chip] = target.slice(4)
    onChange({ ...answer, placed: next })
  }
  const chipState = (chip: string, placedIn: string | null) => {
    if (!result) return ''
    const h = home.get(chip)
    if (!h) return placedIn ? 'bad' : '' // distractor: fine only if left in the pool
    return placedIn === h.id ? 'ok' : 'bad'
  }
  return (
    <ChipBoard onPlace={onPlace} disabled={locked}>
      <p className="muted" style={{ margin: '0 0 0.5rem' }}>
        Drag each chip into a category, or click a chip and then click a category. Click a chip, then the pool, to take it back.
      </p>
      <Target id="pool" label="Chips to place" className="bank">
        {inPool.map((c) => (
          <span key={c} style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'flex-start' }}>
            <Chip id={c} className={chipState(c, null) || (result && home.has(c) ? 'bad' : '')}>
              {c}
            </Chip>
            {result && home.has(c) && <small className="blank-answer">→ {home.get(c)!.title}</small>}
          </span>
        ))}
        {inPool.length === 0 && <span className="muted">All chips placed</span>}
      </Target>
      <div className="buckets">
        {q.categories.map((cat) => (
          <div key={cat.id} className="bucket-wrap">
            <h3>{cat.title}</h3>
            <Target id={`cat:${cat.id}`} label={`Category: ${cat.title}`} className="bucket">
              {inst.pool
                .filter((c) => catOf(c) === cat.id)
                .map((c) => (
                  <span key={c} style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'flex-start' }}>
                    <Chip id={c} className={chipState(c, cat.id)}>
                      {c}
                    </Chip>
                    {result && chipState(c, cat.id) === 'bad' && <small className="blank-answer">{home.get(c) ? `→ ${home.get(c)!.title}` : 'not in any category'}</small>}
                  </span>
                ))}
            </Target>
          </div>
        ))}
      </div>
    </ChipBoard>
  )
}
