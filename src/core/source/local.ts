import { localSlug } from './slug.ts'
import { SourceError, type QuizSource } from './types.ts'

const SKIP_DIRS = new Set(['.git', 'node_modules', '.DS_Store'])
const MAX_FILES = 5000

/** A picked folder, read from memory. `files` maps manifest-relative paths to File objects. */
export class LocalFolderSource implements QuizSource {
  readonly slug: string
  readonly label: string
  private urls = new Map<string, string>()
  readonly folderName: string
  private readonly files: ReadonlyMap<string, File>
  private readonly handle?: FileSystemDirectoryHandle

  constructor(folderName: string, files: ReadonlyMap<string, File>, handle?: FileSystemDirectoryHandle) {
    this.folderName = folderName
    this.files = files
    this.handle = handle
    this.slug = localSlug(folderName)
    this.label = `local folder "${folderName}"`
  }

  /** From `<input webkitdirectory>`: a one-shot snapshot (cannot be reloaded). */
  static fromFileList(list: ArrayLike<File>): LocalFolderSource {
    const files = new Map<string, File>()
    let root = ''
    for (const f of Array.from(list)) {
      const rel = (f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name
      const parts = rel.split('/')
      root ||= parts.length > 1 ? parts[0] : ''
      const inner = parts.length > 1 ? parts.slice(1) : parts
      if (inner.some((s) => SKIP_DIRS.has(s))) continue
      files.set(inner.join('/'), f)
    }
    return new LocalFolderSource(root || 'folder', files)
  }

  /** From showDirectoryPicker(): re-scannable, so edits on disk show up after reload(). */
  static async fromDirectoryHandle(handle: FileSystemDirectoryHandle): Promise<LocalFolderSource> {
    const files = new Map<string, File>()
    async function walk(dir: FileSystemDirectoryHandle, prefix: string): Promise<void> {
      for await (const entry of dir.values()) {
        if (SKIP_DIRS.has(entry.name)) continue
        if (files.size >= MAX_FILES) return
        if (entry.kind === 'directory') await walk(entry as FileSystemDirectoryHandle, `${prefix}${entry.name}/`)
        else files.set(prefix + entry.name, await (entry as FileSystemFileHandle).getFile())
      }
    }
    await walk(handle, '')
    return new LocalFolderSource(handle.name, files, handle)
  }

  has(path: string) {
    return this.files.has(path)
  }
  urlFor(path: string) {
    return `${this.folderName}/${path}`
  }
  assetUrl(path: string) {
    const file = this.files.get(path)
    if (!file) return path
    let url = this.urls.get(path)
    if (!url) this.urls.set(path, (url = URL.createObjectURL(file)))
    return url
  }
  async readText(path: string) {
    const f = this.files.get(path)
    if (!f) throw new SourceError('not-found', this.urlFor(path), 404)
    try {
      return await f.text()
    } catch {
      // The file changed on disk since it was picked (Chromium invalidates the snapshot).
      throw new SourceError('network', this.urlFor(path), undefined, `could not read ${path}: it changed since the folder was picked; use Reload`)
    }
  }
  suggestManifestFolder() {
    if (this.files.has('manifest.json')) return undefined
    const dirs = [...this.files.keys()].filter((p) => /^[^/]+\/manifest\.json$/.test(p)).map((p) => p.split('/')[0])
    return dirs.length === 1 ? dirs[0] : undefined
  }
  get canReload() {
    return this.handle !== undefined
  }
  async reload(): Promise<QuizSource> {
    if (!this.handle) throw new Error('this folder was picked without a directory handle and cannot be reloaded')
    this.dispose()
    return LocalFolderSource.fromDirectoryHandle(this.handle)
  }
  dispose() {
    for (const u of this.urls.values()) URL.revokeObjectURL(u)
    this.urls.clear()
  }
}

type PickerWindow = Window & { showDirectoryPicker?: (o?: { mode?: 'read' }) => Promise<FileSystemDirectoryHandle> }

export const supportsDirectoryPicker = () => typeof window !== 'undefined' && typeof (window as PickerWindow).showDirectoryPicker === 'function'

/** Chromium: pick a folder with a reloadable handle. Rejects with AbortError if the user cancels. */
export async function pickDirectory(): Promise<LocalFolderSource> {
  return LocalFolderSource.fromDirectoryHandle(await (window as PickerWindow).showDirectoryPicker!({ mode: 'read' }))
}
