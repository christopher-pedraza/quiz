import type { Tolerance } from '../../core/model/types.ts'

const pct = (x: number) => `${Number((x * 100).toPrecision(4))}%`

export function toleranceText(t: Tolerance | undefined): string | undefined {
  if (t === undefined) return undefined
  if (typeof t === 'number') return t > 0 ? `±${t}` : undefined
  const parts = [t.abs ? `±${t.abs}` : '', t.rel ? `±${pct(t.rel)}` : ''].filter(Boolean)
  return parts.length ? parts.join(' or ') : undefined
}
