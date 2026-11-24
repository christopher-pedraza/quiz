import { resolveRelative } from '../source/paths.ts'

/** Relative file paths referenced by Markdown images / <img> / links, normalized. For "does this asset exist" diagnostics. */
export function findRelativeAssets(markdown: string): { raw: string; path: string }[] {
  const raws: string[] = []
  for (const m of markdown.matchAll(/!\[[^\]]*\]\(\s*<?([^)\s>]+)/g)) raws.push(m[1])
  for (const m of markdown.matchAll(/<img\b[^>]*?\bsrc\s*=\s*["']([^"']+)["']/gi)) raws.push(m[1])
  const out: { raw: string; path: string }[] = []
  for (const raw of raws) {
    const r = resolveRelative(raw)
    if (r.kind === 'path') out.push({ raw, path: r.path })
  }
  return out
}
