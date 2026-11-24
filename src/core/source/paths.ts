export type Resolved =
  | { kind: 'path'; path: string; /** "?x=1#frag" kept off the path. */ suffix: string }
  /** http(s), data:, mailto:, protocol-relative, … : leave alone. */
  | { kind: 'external' }
  /** Would climb above the manifest folder (or is empty): reject. */
  | { kind: 'escape' }
  /** Pure fragment such as "#section". */
  | { kind: 'fragment' }

/**
 * Resolves a path written in a quiz file against the manifest folder. `./a.png`, `a.png` and `/a.png` are the same file;
 * `../x` that would leave the folder is rejected, so one quiz can never read another quiz's (or the repo's) files.
 */
export function resolveRelative(raw: string): Resolved {
  const s = raw.trim()
  if (s.startsWith('#')) return { kind: 'fragment' }
  if (/^[a-z][a-z0-9+.-]*:/i.test(s) || s.startsWith('//')) return { kind: 'external' }
  const cut = s.search(/[?#]/)
  const body = cut === -1 ? s : s.slice(0, cut)
  const suffix = cut === -1 ? '' : s.slice(cut)
  const out: string[] = []
  for (const seg of body.split(/[\\/]/)) {
    let d = seg
    try {
      d = decodeURIComponent(seg)
    } catch {
      /* keep raw */
    }
    if (d === '' || d === '.') continue
    if (d === '..') {
      if (out.length === 0) return { kind: 'escape' }
      out.pop()
    } else out.push(seg)
  }
  if (out.length === 0) return { kind: 'escape' }
  return { kind: 'path', path: out.join('/'), suffix }
}

export const encodePath = (path: string) => path.split('/').map(encodeURIComponent).join('/')
export const trimSlashes = (p: string) => p.replace(/^\/+|\/+$/g, '')
