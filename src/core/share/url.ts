import { trimSlashes } from '../source/paths.ts'
import { githubSpec } from '../source/parse.ts'
import type { SourceSpec } from '../source/types.ts'
import { decodePreset, encodePreset, type ExamPreset } from './preset.ts'

export interface ParsedLocation {
  source?: SourceSpec
  preset?: ExamPreset
  /** Human-readable problems with the link; the app shows them on the hub and ignores the bad part. */
  errors: string[]
}

const SAMPLE = /^[a-z0-9-]{1,40}$/

/** `?repo=owner/name&path=a/b&ref=main[&preset=…]` or `?sample=demo`. Never throws. */
export function parseLocation(search: string): ParsedLocation {
  const q = new URLSearchParams(search)
  const out: ParsedLocation = { errors: [] }
  const sample = q.get('sample')
  const repo = q.get('repo')
  if (sample !== null) {
    if (SAMPLE.test(sample)) out.source = { kind: 'sample', name: sample }
    else out.errors.push(`"${sample}" is not a valid sample name`)
  } else if (repo !== null) {
    const [owner = '', name = '', ...extra] = repo.split('/')
    const parsed = extra.length
      ? { error: '"repo" must be owner/name; put the folder in "path"' }
      : githubSpec(owner, name, q.get('ref') || undefined, trimSlashes(q.get('path') ?? '').split('/').filter(Boolean))
    if ('spec' in parsed) out.source = parsed.spec
    else out.errors.push(`invalid link: ${parsed.error}`)
  }
  const preset = q.get('preset')
  if (preset !== null && out.source) {
    const d = decodePreset(preset)
    if (d.preset) out.preset = d.preset
    if (d.error) out.errors.push(d.error)
  }
  return out
}

const seg = (p: string) => p.split('/').map(encodeURIComponent).join('/')

/** Readable share URL: slashes in repo/path/ref stay slashes. `base` is origin + pathname of the app. */
export function buildShareUrl(base: string, source: SourceSpec, preset?: ExamPreset): string {
  const params: string[] = []
  if (source.kind === 'sample') params.push(`sample=${encodeURIComponent(source.name)}`)
  else {
    params.push(`repo=${encodeURIComponent(source.owner)}/${encodeURIComponent(source.repo)}`)
    if (source.path) params.push(`path=${seg(trimSlashes(source.path))}`)
    if (source.ref && source.ref !== 'main') params.push(`ref=${seg(source.ref)}`)
  }
  if (preset) params.push(`preset=${encodePreset(preset)}`)
  return `${base}?${params.join('&')}`
}
