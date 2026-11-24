export interface QuizSource {
  /** Storage namespace: stable for the same quiz location. */
  readonly slug: string
  /** Human readable location, e.g. "owner/repo@main/course-1". */
  readonly label: string
  /** Reads a manifest-relative file (path already normalized). Throws SourceError. */
  readText(path: string): Promise<string>
  /** URL an <img> can load: raw.githubusercontent URL, blob: URL, or same-origin URL. */
  assetUrl(path: string): string
  /** Where readText looks, for diagnostics. */
  urlFor(path: string): string
  /** Only sources that can list their files (local, bundled-with-index) implement this. */
  has?(path: string): boolean
  /** Local source: if manifest.json is one folder down, which folder. */
  suggestManifestFolder?(): string | undefined
  /** True when reload() works (directory-handle local sources). */
  readonly canReload?: boolean
  /** Re-reads the folder without re-picking it; returns a fresh source (the old one is disposed). */
  reload?(): Promise<QuizSource>
  dispose?(): void
}

export type SourceErrorKind = 'not-found' | 'http' | 'network'

export class SourceError extends Error {
  readonly kind: SourceErrorKind
  readonly url: string
  readonly status?: number
  constructor(kind: SourceErrorKind, url: string, status?: number, detail?: string) {
    super(detail ?? (kind === 'not-found' ? `not found: ${url}` : kind === 'http' ? `HTTP ${status} for ${url}` : `network error fetching ${url}`))
    this.kind = kind
    this.url = url
    this.status = status
  }
}

export interface GithubSpec {
  kind: 'github'
  owner: string
  repo: string
  /** Branch, tag or commit. Defaults to "main". */
  ref: string
  /** Folder inside the repo, no leading/trailing slash; '' = repo root. */
  path: string
}
export interface SampleSpec {
  kind: 'sample'
  name: string
}
export type SourceSpec = GithubSpec | SampleSpec
