// Canonical forms used to compare what the learner typed with the accepted answers.
// Pure and dependency-free.

/** Trim lines, drop empty ones, collapse whitespace runs to one space. */
export function collapse(input: string): string {
  return input
    .replace(/\r/g, '')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
    .join(' ')
    .replace(/\s+/g, ' ')
}

/**
 * Code-aware: whitespace is only significant where it separates two word-ish tokens (`not x`, `for i in`),
 * so `x=a+b` equals `x = a + b`. Quote style is ignored. Case is significant.
 */
export function normalizeCode(input: string): string {
  return collapse(input)
    .replace(/\s*([()[\]{},:;=+\-*/%<>!&|^~.@])\s*/g, '$1')
    .replace(/'/g, '"')
}

/** Prose: Unicode-normalized, whitespace-collapsed, surrounding punctuation ignored (case is handled by the matcher). */
export function normalizeProse(input: string): string {
  return collapse(input.normalize('NFKC')).replace(/^[\s"'“”‘’.,;:!?]+|[\s"'“”‘’.,;:!?]+$/g, '')
}

export interface MatchOptions {
  /** 'code' (default) or 'prose'. */
  kind?: 'code' | 'prose'
  /** Overrides the case rule of the kind: prose is insensitive by default, code sensitive. */
  caseSensitive?: boolean
}

function norm(s: string, o: MatchOptions): string {
  const kind = o.kind ?? 'code'
  const n = kind === 'code' ? normalizeCode(s) : normalizeProse(s)
  const sensitive = o.caseSensitive ?? kind === 'code'
  return sensitive ? n : n.toLowerCase()
}

/** Regex used for `patterns`, compiled once; null if invalid. Anchored, applied to the collapsed input. */
export function compilePattern(p: string): RegExp | null {
  if (p.length > 300) return null
  try {
    return new RegExp(`^(?:${p})$`)
  } catch {
    return null
  }
}

/** Does `input` match any accepted answer or accepted regex pattern? */
export function matchesAny(
  input: string,
  answers: readonly string[],
  patterns: readonly string[] = [],
  opts: MatchOptions = {},
): boolean {
  const n = norm(input, opts)
  if (n === '' && !answers.some((a) => norm(a, opts) === '')) return false
  if (answers.some((a) => norm(a, opts) === n)) return true
  if (patterns.length === 0) return false
  const c = collapse(input)
  return patterns.some((p) => compilePattern(p)?.test(c) ?? false)
}
