import type { Diagnostic, Manifest, Question, Reference } from '../model/types.ts'
import { findRelativeAssets } from '../content/assets.ts'
import { checkQuestion } from '../question-types/index.ts'
import { validateManifest, validateQuestionShape, validateReferenceEntries } from '../schema/validate.ts'
import { resolveRelative } from '../source/paths.ts'
import { SourceError, type QuizSource } from '../source/types.ts'
import { resolveTheme, type ResolvedTheme } from '../theme/theme.ts'

export interface LoadedQuiz {
  source: QuizSource
  manifest: Manifest
  /** Only questions that passed validation. */
  questions: Question[]
  /** Questions dropped because of errors. */
  skipped: number
  reference?: Reference
  theme?: ResolvedTheme
  /** Errors for skipped questions / files, and warnings. Never empty-by-accident: the UI shows a banner when non-empty. */
  diagnostics: Diagnostic[]
}

export type LoadResult = { ok: true; quiz: LoadedQuiz } | { ok: false; diagnostics: Diagnostic[] }

const error = (d: Omit<Diagnostic, 'severity'>): Diagnostic => ({ severity: 'error', ...d })
const warning = (d: Omit<Diagnostic, 'severity'>): Diagnostic => ({ severity: 'warning', ...d })

/** Turns a failed read into a diagnostic that says what was tried and what to check. */
export function readFailure(e: unknown, source: QuizSource, file: string): Diagnostic {
  if (e instanceof SourceError) {
    if (e.kind === 'not-found') {
      const inner = file === 'manifest.json' ? source.suggestManifestFolder?.() : undefined
      const isGithub = source.slug.startsWith('gh:')
      return error({
        file,
        message: file === 'manifest.json' ? `manifest.json not found. Every quiz folder needs one.` : `"${file}" is listed in the manifest but was not found.`,
        hint:
          (inner ? `The folder you picked contains the quiz one level down: pick "${inner}" instead. ` : '') +
          `Looked for: ${e.url}` +
          (isGithub && file === 'manifest.json'
            ? '. Check the owner/repo, the branch (ref) and the folder path, and that the repository is public. Raw URLs are cached for up to 5 minutes after a push.'
            : ''),
      })
    }
    if (e.kind === 'http') return error({ file, message: `fetching "${file}" failed with HTTP ${e.status}`, hint: `URL: ${e.url}${e.status === 429 ? '. Too many requests; wait a minute and retry.' : ''}` })
    return error({ file, message: `could not fetch "${file}"`, hint: e.message === `network error fetching ${e.url}` ? `Network error or blocked request: ${e.url}` : e.message })
  }
  return error({ file, message: `could not read "${file}": ${(e as Error).message}` })
}

function parseJson(text: string, file: string): { value?: unknown; diagnostic?: Diagnostic } {
  try {
    return { value: JSON.parse(text) }
  } catch (e) {
    return { diagnostic: error({ file, message: `invalid JSON: ${(e as Error).message}` }) }
  }
}

interface RawQuestion {
  raw: unknown
  file: string
  index: number
  line?: number
}

/** .json must hold an array; .jsonl is one question per line. A bad line only skips that line. */
export function parseQuestionFile(text: string, file: string): { items: RawQuestion[]; diagnostics: Diagnostic[]; unparsable: number } {
  const diagnostics: Diagnostic[] = []
  const items: RawQuestion[] = []
  let unparsable = 0
  if (file.endsWith('.jsonl')) {
    let index = 0
    text.split(/\r?\n/).forEach((l, i) => {
      if (!l.trim()) return
      try {
        items.push({ raw: JSON.parse(l), file, index: index++, line: i + 1 })
      } catch (e) {
        unparsable++
        diagnostics.push(error({ file, line: i + 1, index: index++, message: `line is not valid JSON: ${(e as Error).message}` }))
      }
    })
    return { items, diagnostics, unparsable }
  }
  const p = parseJson(text, file)
  if (p.diagnostic) return { items, diagnostics: [p.diagnostic], unparsable }
  if (!Array.isArray(p.value)) return { items, diagnostics: [error({ file, message: 'a question file must contain a JSON array of questions', hint: 'wrap the object in [ ], or use .jsonl for one question per line' })], unparsable }
  p.value.forEach((raw, index) => items.push({ raw, file, index }))
  return { items, diagnostics, unparsable }
}

function strings(v: unknown, out: string[] = []): string[] {
  if (typeof v === 'string') out.push(v)
  else if (Array.isArray(v)) v.forEach((x) => strings(x, out))
  else if (v && typeof v === 'object') Object.values(v).forEach((x) => strings(x, out))
  return out
}

export async function loadQuiz(source: QuizSource): Promise<LoadResult> {
  let manifestText: string
  try {
    manifestText = await source.readText('manifest.json')
  } catch (e) {
    return { ok: false, diagnostics: [readFailure(e, source, 'manifest.json')] }
  }
  const mj = parseJson(manifestText, 'manifest.json')
  if (mj.diagnostic) return { ok: false, diagnostics: [mj.diagnostic] }
  const { manifest, diagnostics: manifestDiagnostics } = validateManifest(mj.value)
  if (!manifest) return { ok: false, diagnostics: manifestDiagnostics }

  const diagnostics: Diagnostic[] = [...manifestDiagnostics]
  const topicIds = new Set(manifest.topics.map((t) => t.id))
  const files = manifest.questions.map((f) => ({ file: f, resolved: resolveRelative(f) }))

  const [fileResults, reference, theme] = await Promise.all([
    Promise.all(
      files.map(async ({ file, resolved }) => {
        if (resolved.kind !== 'path') return { items: [] as RawQuestion[], unparsable: 0, diagnostics: [error({ file, message: `"${file}" must be a path inside the quiz folder` })] }
        try {
          return parseQuestionFile(await source.readText(resolved.path), file)
        } catch (e) {
          return { items: [] as RawQuestion[], unparsable: 0, diagnostics: [readFailure(e, source, file)] }
        }
      }),
    ),
    loadReference(source, manifest, diagnostics),
    loadTheme(source, manifest, diagnostics),
  ])

  const questions: Question[] = []
  const seenIds = new Map<string, string>()
  let skipped = 0
  for (const { items, diagnostics: fileDiagnostics, unparsable } of fileResults) {
    diagnostics.push(...fileDiagnostics)
    skipped += unparsable
    for (const { raw, file, index, line } of items) {
      const where = { file, index, ...(line !== undefined && { line }) }
      const shape = validateQuestionShape(raw, where)
      if (!shape.question) {
        diagnostics.push(...shape.diagnostics)
        skipped++
        continue
      }
      const q = shape.question
      const w = { ...where, id: q.id }
      const problems: Diagnostic[] = []
      if (!topicIds.has(q.topic)) {
        problems.push(error({ ...w, path: '/topic', message: `topic "${q.topic}" is not declared in manifest.json`, hint: `declared topics: ${[...topicIds].join(', ')}` }))
      }
      const prev = seenIds.get(q.id)
      if (prev) problems.push(error({ ...w, path: '/id', message: `duplicate question id "${q.id}" (first used in ${prev})`, hint: 'ids must be unique across the whole quiz' }))
      for (const issue of checkQuestion(q)) problems.push({ ...w, ...issue })
      if (source.has) {
        for (const s of strings(q)) {
          for (const a of findRelativeAssets(s)) if (!source.has(a.path)) problems.push(warning({ ...w, message: `image "${a.raw}" not found in the quiz folder` }))
        }
      }
      diagnostics.push(...problems)
      if (problems.some((p) => p.severity === 'error')) {
        skipped++
        continue
      }
      seenIds.set(q.id, file)
      questions.push(q)
    }
  }

  if (reference?.kind === 'entries') {
    const known = new Set(reference.entries.flatMap((e) => [e.name, ...(e.aliases ?? [])]))
    for (const q of questions)
      for (const name of q.reference ?? [])
        if (!known.has(name)) diagnostics.push(warning({ id: q.id, path: '/reference', message: `reference entry "${name}" does not exist in the reference sheet` }))
  }

  if (questions.length === 0) {
    return { ok: false, diagnostics: [...diagnostics, error({ message: 'no valid questions could be loaded from this quiz' })] }
  }
  return { ok: true, quiz: { source, manifest, questions, skipped, reference, theme, diagnostics } }
}

async function loadReference(source: QuizSource, manifest: Manifest, diagnostics: Diagnostic[]): Promise<Reference | undefined> {
  if (!manifest.reference) return undefined
  const file = manifest.reference
  const r = resolveRelative(file)
  if (r.kind !== 'path') {
    diagnostics.push(warning({ file, message: `reference "${file}" must be a path inside the quiz folder; the Reference button is hidden` }))
    return undefined
  }
  try {
    const text = await source.readText(r.path)
    if (file.endsWith('.md')) return { kind: 'markdown', text }
    const j = parseJson(text, file)
    if (j.diagnostic) throw new Error(j.diagnostic.message)
    const v = validateReferenceEntries(j.value, file)
    if (!v.reference) {
      diagnostics.push(...v.diagnostics.map((d) => ({ ...d, severity: 'warning' as const, hint: d.hint ?? 'the Reference button is hidden until this is fixed' })))
      return undefined
    }
    return v.reference
  } catch (e) {
    const d = e instanceof SourceError ? readFailure(e, source, file) : warning({ file, message: (e as Error).message })
    diagnostics.push({ ...d, severity: 'warning', hint: [d.hint, 'the Reference button is hidden'].filter(Boolean).join('. ') })
    return undefined
  }
}

async function loadTheme(source: QuizSource, manifest: Manifest, diagnostics: Diagnostic[]): Promise<ResolvedTheme | undefined> {
  const t = manifest.theme
  if (t === undefined) return undefined
  let raw: unknown = t
  let file = 'manifest.json'
  if (typeof t === 'string') {
    file = t
    const r = resolveRelative(t)
    try {
      if (r.kind !== 'path') throw new Error(`theme "${t}" must be a path inside the quiz folder`)
      const j = parseJson(await source.readText(r.path), t)
      if (j.diagnostic) throw new Error(j.diagnostic.message)
      raw = j.value
    } catch (e) {
      const d = e instanceof SourceError ? readFailure(e, source, t) : warning({ file: t, message: (e as Error).message })
      diagnostics.push({ ...d, severity: 'warning', hint: [d.hint, 'using the default theme'].filter(Boolean).join('. ') })
      return undefined
    }
  }
  const r = resolveTheme(raw, file)
  diagnostics.push(...r.diagnostics)
  return r.theme
}
