import { trimSlashes } from './paths.ts'
import type { GithubSpec } from './types.ts'

const OWNER = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/
const REPO = /^[A-Za-z0-9._-]{1,100}$/

export type ParsedSource = { spec: GithubSpec } | { error: string }

/** Validates the parts and builds a spec. `rest` is the folder path split into segments. */
export function githubSpec(owner: string, repo: string, ref: string | undefined, rest: string[]): ParsedSource {
  repo = repo.replace(/\.git$/, '')
  if (!OWNER.test(owner)) return { error: `"${owner}" is not a valid GitHub user or organization name` }
  if (!REPO.test(repo)) return { error: `"${repo}" is not a valid repository name` }
  if (rest.length && /^manifest\.json$/i.test(rest[rest.length - 1])) rest = rest.slice(0, -1)
  if (rest.some((s) => s === '..')) return { error: 'the path must not contain ".."' }
  return { spec: { kind: 'github', owner, repo, ref: ref || 'main', path: trimSlashes(rest.join('/')) } }
}

/**
 * Accepts what people paste: a github.com tree/blob URL, a raw.githubusercontent.com URL, or `owner/repo[@ref][/path]`.
 * A branch name containing "/" is ambiguous in tree URLs: the first segment after /tree/ is taken as the ref and the
 * hub lets the user correct it.
 */
export function parseSourceInput(input: string): ParsedSource {
  const text = input.trim()
  if (!text) return { error: 'paste a GitHub folder URL or owner/repo' }
  if (/^https?:\/\//i.test(text) || /^(www\.)?(github\.com|raw\.githubusercontent\.com)\//i.test(text)) {
    let url: URL
    try {
      url = new URL(/^https?:/i.test(text) ? text : `https://${text}`)
    } catch {
      return { error: 'that does not look like a valid URL' }
    }
    const seg = url.pathname.split('/').filter(Boolean).map(decodeURIComponent)
    if (/^(www\.)?github\.com$/i.test(url.hostname)) {
      if (seg.length < 2) return { error: 'the URL needs at least owner/repo' }
      const [owner, repo, kind, ref, ...rest] = seg
      if (kind === undefined) return githubSpec(owner, repo, undefined, [])
      if (kind !== 'tree' && kind !== 'blob') return { error: `unsupported GitHub URL (…/${kind}/…); use a …/tree/<branch>/<folder> link` }
      return githubSpec(owner, repo, ref, rest)
    }
    if (url.hostname.toLowerCase() === 'raw.githubusercontent.com') {
      if (seg.length < 3) return { error: 'a raw URL needs owner/repo/ref' }
      const [owner, repo, ...tail] = seg
      return tail[0] === 'refs' && (tail[1] === 'heads' || tail[1] === 'tags')
        ? githubSpec(owner, repo, tail[2], tail.slice(3))
        : githubSpec(owner, repo, tail[0], tail.slice(1))
    }
    return { error: 'only github.com and raw.githubusercontent.com URLs are supported' }
  }
  const [owner, repoPart, ...rest] = text.split('/').filter(Boolean)
  if (!owner || !repoPart) return { error: 'expected owner/repo, e.g. octocat/my-quizzes/course-1' }
  const [repo, ref] = repoPart.split('@')
  return githubSpec(owner, repo, ref, rest)
}
