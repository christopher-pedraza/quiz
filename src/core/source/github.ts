import { encodePath, trimSlashes } from './paths.ts'
import { githubSlug } from './slug.ts'
import { SourceError, type GithubSpec, type QuizSource } from './types.ts'

const RAW = 'https://raw.githubusercontent.com'
const SHA = /^[0-9a-f]{7,40}$/i

/** Reads files straight from raw.githubusercontent.com: CORS-enabled, no API, no rate limit. */
export class GitHubSource implements QuizSource {
  readonly slug: string
  readonly label: string
  /** Ref spellings to try, in order. Only refs containing "/" need more than the plain form. */
  private readonly refs: string[]
  private working?: string
  readonly spec: Pick<GithubSpec, 'owner' | 'repo' | 'ref' | 'path'>
  private readonly fetchImpl: typeof fetch

  constructor(spec: Pick<GithubSpec, 'owner' | 'repo' | 'ref' | 'path'>, fetchImpl: typeof fetch = (...a) => fetch(...a)) {
    this.spec = spec
    this.fetchImpl = fetchImpl
    this.slug = githubSlug(spec)
    const p = trimSlashes(spec.path)
    this.label = `${spec.owner}/${spec.repo}@${spec.ref}${p ? '/' + p : ''}`
    this.refs = spec.ref.includes('/') && !SHA.test(spec.ref) ? [spec.ref, `refs/heads/${spec.ref}`, `refs/tags/${spec.ref}`] : [spec.ref]
  }

  private url(ref: string, path: string) {
    const base = [this.spec.owner, this.spec.repo, ref].map((s) => encodePath(s)).join('/')
    const folder = trimSlashes(this.spec.path)
    return `${RAW}/${base}/${folder ? encodePath(folder) + '/' : ''}${encodePath(path)}`
  }

  urlFor(path: string) {
    return this.url(this.working ?? this.refs[0], path)
  }
  assetUrl(path: string) {
    return this.urlFor(path)
  }

  async readText(path: string): Promise<string> {
    const candidates = this.working ? [this.working] : this.refs
    for (const ref of candidates) {
      const url = this.url(ref, path)
      let res: Response
      try {
        res = await this.fetchImpl(url, { cache: 'no-cache' })
      } catch {
        throw new SourceError('network', url)
      }
      if (res.ok) {
        this.working = ref
        return res.text()
      }
      if (res.status !== 404) throw new SourceError('http', url, res.status)
    }
    throw new SourceError('not-found', this.url(candidates[0], path), 404)
  }
}
