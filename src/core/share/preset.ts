import { QUESTION_TYPES, type Difficulty, type QuestionType } from '../model/types.ts'
import type { ExamConfig } from '../exam/sample.ts'

/** What a share link can carry: an exam configuration without the volatile parts. */
export type ExamPreset = Omit<ExamConfig, 'seed'> & { seed?: number }

const MAX_LEN = 4096
const TYPES = new Set<string>(QUESTION_TYPES.map((t) => t.type))
const DIFFS = new Set<string>(['easy', 'medium', 'hard'])

function b64urlEncode(s: string): string {
  const bytes = new TextEncoder().encode(s)
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
function b64urlDecode(s: string): string {
  const b = atob(s.replace(/-/g, '+').replace(/_/g, '/'))
  return new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(b, (c) => c.charCodeAt(0)))
}

/** Compact, versioned JSON → base64url. Defaults are omitted to keep links short. */
export function encodePreset(p: ExamPreset): string {
  const o: Record<string, unknown> = { v: 1, n: p.count }
  if (p.minutes) o.m = p.minutes
  if (p.topics?.length) o.tp = p.topics
  if (p.types?.length) o.ty = p.types
  if (p.difficulties?.length) o.d = p.difficulties
  if (p.weights && Object.keys(p.weights).length) o.w = p.weights
  if (p.seed !== undefined) o.seed = p.seed >>> 0
  if (p.shuffle === false) o.sh = 0
  return b64urlEncode(JSON.stringify(o))
}

const clampInt = (v: unknown, lo: number, hi: number): number | undefined =>
  typeof v === 'number' && Number.isFinite(v) && v >= lo ? Math.min(hi, Math.round(v)) : undefined
const strList = (v: unknown, max = 100): string[] | undefined =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x.length > 0 && x.length <= 120).slice(0, max) : undefined

/** Defensive: anything malformed is dropped or clamped, never thrown at the caller. */
export function decodePreset(text: string): { preset?: ExamPreset; error?: string } {
  if (text.length > MAX_LEN) return { error: 'the exam preset in this link is too large' }
  let raw: unknown
  try {
    raw = JSON.parse(b64urlDecode(text))
  } catch {
    return { error: 'the exam preset in this link is damaged and was ignored' }
  }
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return { error: 'the exam preset in this link is damaged and was ignored' }
  const o = raw as Record<string, unknown>
  if (o.v !== 1) return { error: `the exam preset in this link has an unsupported version (${String(o.v)})` }
  const preset: ExamPreset = { count: clampInt(o.n, 1, 500) ?? 20 }
  const minutes = clampInt(o.m, 1, 600)
  if (minutes) preset.minutes = minutes
  const topics = strList(o.tp)
  if (topics?.length) preset.topics = topics
  const types = strList(o.ty)?.filter((t) => TYPES.has(t))
  if (types?.length) preset.types = types as QuestionType[]
  const diffs = strList(o.d)?.filter((t) => DIFFS.has(t))
  if (diffs?.length) preset.difficulties = diffs as Difficulty[]
  if (o.w && typeof o.w === 'object' && !Array.isArray(o.w)) {
    const w: Record<string, number> = {}
    for (const [k, v] of Object.entries(o.w).slice(0, 100)) {
      const n = clampInt(v, 0, 100)
      if (n !== undefined && k.length <= 120) w[k] = n
    }
    if (Object.keys(w).length) preset.weights = w
  }
  const seed = clampInt(o.seed, 0, 0xffffffff)
  if (seed !== undefined) preset.seed = seed
  if (o.sh === 0) preset.shuffle = false
  return { preset }
}
