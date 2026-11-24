import Ajv, { type ErrorObject, type ValidateFunction } from 'ajv'
import type { Diagnostic, Manifest, ManifestInput, Question, Reference, TopicDef } from '../model/types.ts'
import { manifestSchema, questionSchema, referenceSchema, QUESTION_TYPE_NAMES } from './schemas.ts'
import { didYouMean } from './suggest.ts'

const ajv = new Ajv({ allErrors: true, verbose: true, discriminator: true, strict: true, allowUnionTypes: true })
let compiled: { question: ValidateFunction; manifest: ValidateFunction; reference: ValidateFunction } | undefined

function validators() {
  compiled ??= {
    question: ajv.compile(questionSchema),
    manifest: ajv.compile(manifestSchema),
    reference: ajv.compile(referenceSchema),
  }
  return compiled
}

export interface Where {
  file?: string
  line?: number
  index?: number
  id?: string
}

const field = (path: string) => path.split('/').filter(Boolean).pop() ?? 'value'
const show = (v: unknown) => {
  const s = JSON.stringify(v)
  return s === undefined ? String(v) : s.length > 40 ? s.slice(0, 37) + '…"' : s
}

function describe(e: ErrorObject): { path: string; message: string; hint?: string } {
  const here = e.instancePath
  const p = e.params as Record<string, unknown>
  const parent = e.parentSchema as { properties?: Record<string, unknown>; description?: string } | undefined
  switch (e.keyword) {
    case 'required': {
      const name = String(p.missingProperty)
      return { path: `${here}/${name}`, message: `missing required field "${name}"` }
    }
    case 'additionalProperties': {
      const name = String(p.additionalProperty)
      const known = Object.keys(parent?.properties ?? {})
      const guess = didYouMean(name, known)
      return {
        path: `${here}/${name}`,
        message: `unknown field "${name}"`,
        hint: guess ? `did you mean "${guess}"?` : known.length ? `allowed here: ${known.join(', ')}` : undefined,
      }
    }
    case 'type':
      return { path: here, message: `"${field(here)}" must be ${String(p.type)}, got ${show(e.data)}` }
    case 'enum':
      return { path: here, message: `"${field(here)}" must be one of ${(p.allowedValues as unknown[]).map(show).join(', ')}, got ${show(e.data)}` }
    case 'const':
      return { path: here, message: `"${field(here)}" must be ${show(p.allowedValue)}, got ${show(e.data)}` }
    case 'minItems':
      return { path: here, message: `"${field(here)}" needs at least ${String(p.limit)} item(s)` }
    case 'minLength':
      return { path: here, message: `"${field(here)}" must not be empty` }
    case 'minimum':
    case 'exclusiveMinimum':
      return { path: here, message: `"${field(here)}" must be ${e.keyword === 'minimum' ? '≥' : '>'} ${String(p.limit)}, got ${show(e.data)}` }
    case 'maximum':
      return { path: here, message: `"${field(here)}" must be ≤ ${String(p.limit)}, got ${show(e.data)}` }
    case 'pattern':
      return { path: here, message: `"${field(here)}" has an invalid format: ${show(e.data)}`, hint: parent?.description }
    case 'discriminator':
      return p.error === 'tag'
        ? { path: `${here}/type`, message: 'missing or non-string "type"', hint: `one of: ${QUESTION_TYPE_NAMES.join(', ')}` }
        : (() => {
            const got = String(p.tagValue)
            const guess = didYouMean(got, QUESTION_TYPE_NAMES)
            return {
              path: `${here}/type`,
              message: `unknown question type ${show(got)}`,
              hint: guess ? `did you mean "${guess}"?` : `one of: ${QUESTION_TYPE_NAMES.join(', ')}`,
            }
          })()
    case 'anyOf':
    case 'oneOf':
      return { path: here, message: `"${field(here)}" has the wrong shape`, hint: parent?.description ? `expected ${parent.description}` : undefined }
    default:
      return { path: here, message: `"${field(here)}" ${e.message ?? 'is invalid'}` }
  }
}

/** ajv errors → diagnostics. Union errors replace their (noisy) children; duplicates are dropped. */
export function toDiagnostics(errors: ErrorObject[] | null | undefined, where: Where): Diagnostic[] {
  if (!errors) return []
  const unions = errors.filter((e) => e.keyword === 'anyOf' || e.keyword === 'oneOf').map((e) => e.instancePath)
  const kept = errors.filter(
    (e) => e.keyword === 'anyOf' || e.keyword === 'oneOf' || !unions.some((u) => e.instancePath === u || e.instancePath.startsWith(u + '/')),
  )
  const seen = new Set<string>()
  const out: Diagnostic[] = []
  for (const e of kept) {
    const d = describe(e)
    const key = `${d.path}|${d.message}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push({ severity: 'error', ...where, path: d.path || '/', message: d.message, ...(d.hint && { hint: d.hint }) })
  }
  return out
}

export function validateQuestionShape(raw: unknown, where: Where): { question?: Question; diagnostics: Diagnostic[] } {
  const w = { ...where, ...(typeof (raw as { id?: unknown })?.id === 'string' && { id: (raw as { id: string }).id }) }
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw))
    return { diagnostics: [{ severity: 'error', ...w, message: 'a question must be a JSON object' }] }
  const v = validators().question
  if (v(raw)) return { question: raw as Question, diagnostics: [] }
  return { diagnostics: toDiagnostics(v.errors, w) }
}

export function validateManifest(raw: unknown, file = 'manifest.json'): { manifest?: Manifest; diagnostics: Diagnostic[] } {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw))
    return { diagnostics: [{ severity: 'error', file, message: 'manifest.json must be a JSON object' }] }
  const v = validators().manifest
  if (!v(raw)) return { diagnostics: toDiagnostics(v.errors, { file }) }
  const input = raw as ManifestInput
  const topics: TopicDef[] = input.topics.map((t) => (typeof t === 'string' ? { id: t, title: t } : t))
  const diagnostics: Diagnostic[] = []
  const seen = new Set<string>()
  topics.forEach((t, i) => {
    if (seen.has(t.id)) diagnostics.push({ severity: 'error', file, path: `/topics/${i}`, message: `duplicate topic id "${t.id}"` })
    seen.add(t.id)
  })
  const files = new Set<string>()
  input.questions.forEach((f, i) => {
    if (files.has(f)) diagnostics.push({ severity: 'warning', file, path: `/questions/${i}`, message: `"${f}" is listed twice` })
    files.add(f)
  })
  if (diagnostics.some((d) => d.severity === 'error')) return { diagnostics }
  return { manifest: { ...input, topics }, diagnostics }
}

export function validateReferenceEntries(raw: unknown, file: string): { reference?: Reference; diagnostics: Diagnostic[] } {
  const v = validators().reference
  if (!v(raw)) return { diagnostics: toDiagnostics(v.errors, { file }) }
  return { reference: { kind: 'entries', entries: (raw as { entries: never[] }).entries }, diagnostics: [] }
}
