import { encodePath } from './paths.ts'
import { sampleSlug } from './slug.ts'
import { SourceError, type QuizSource } from './types.ts'

/** A quiz folder served from the app's own origin (the built-in sample). `base` ends with "/". */
export class BundledSource implements QuizSource {
  readonly slug: string
  readonly label: string
  readonly name: string
  private readonly base: string
  private readonly fetchImpl: typeof fetch

  constructor(name: string, base: string, fetchImpl: typeof fetch = (...a) => fetch(...a)) {
    this.name = name
    this.base = base
    this.fetchImpl = fetchImpl
    this.slug = sampleSlug(name)
    this.label = `built-in sample "${name}"`
  }

  urlFor(path: string) {
    return this.base + encodePath(path)
  }
  assetUrl(path: string) {
    return this.urlFor(path)
  }
  async readText(path: string) {
    const url = this.urlFor(path)
    let res: Response
    try {
      res = await this.fetchImpl(url)
    } catch {
      throw new SourceError('network', url)
    }
    if (res.status === 404) throw new SourceError('not-found', url, 404)
    if (!res.ok) throw new SourceError('http', url, res.status)
    return res.text()
  }
}
