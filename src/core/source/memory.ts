import { encodePath } from './paths.ts'
import { SourceError, type QuizSource } from './types.ts'

/** An in-memory folder: for tests and for converting/validating folders in Node scripts. */
export class MemorySource implements QuizSource {
  readonly label = 'memory'
  readonly slug: string
  private readonly files: Record<string, string>
  constructor(files: Record<string, string>, slug = 'memory:test') {
    this.files = files
    this.slug = slug
  }
  urlFor(path: string) {
    return `memory://${path}`
  }
  assetUrl(path: string) {
    return `memory-asset://${encodePath(path)}`
  }
  has(path: string) {
    return path in this.files
  }
  async readText(path: string) {
    if (!(path in this.files)) throw new SourceError('not-found', this.urlFor(path), 404)
    return this.files[path]
  }
}
