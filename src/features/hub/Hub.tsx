import { useRef, useState } from 'react'
import { parseSourceInput } from '../../core/source/parse.ts'
import { LocalFolderSource, pickDirectory, supportsDirectoryPicker } from '../../core/source/local.ts'
import type { SourceSpec } from '../../core/source/types.ts'
import type { RecentEntry } from '../../core/storage/store.ts'

interface Props {
  errors: string[]
  recent: RecentEntry[]
  onOpenSpec(spec: SourceSpec): void
  onOpenLocal(source: LocalFolderSource): void
  onRemoveRecent(slug: string): void
}

const describe = (e: RecentEntry) =>
  e.source.kind === 'github' ? `${e.source.owner}/${e.source.repo}@${e.source.ref}${e.source.path ? '/' + e.source.path : ''}` : e.source.kind === 'sample' ? 'built-in sample' : `local folder "${e.source.name}"`

export function Hub({ errors, recent, onOpenSpec, onOpenLocal, onRemoveRecent }: Props) {
  const [text, setText] = useState('')
  const [ref, setRef] = useState('')
  const [path, setPath] = useState('')
  const [error, setError] = useState<string>()
  const fileInput = useRef<HTMLInputElement>(null)

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    const parsed = parseSourceInput(text)
    if ('error' in parsed) return setError(parsed.error)
    const spec = { ...parsed.spec, ...(ref.trim() && { ref: ref.trim() }), ...(path.trim() && { path: path.trim().replace(/^\/+|\/+$/g, '') }) }
    setError(undefined)
    onOpenSpec(spec)
  }
  const pickLocal = async () => {
    setError(undefined)
    if (supportsDirectoryPicker()) {
      try {
        onOpenLocal(await pickDirectory())
      } catch (e) {
        if ((e as Error).name !== 'AbortError') setError(`Could not open the folder: ${(e as Error).message}`)
      }
    } else fileInput.current?.click()
  }

  return (
    <div className="hub">
      <h1>Quiz</h1>
      <p className="muted">Practice and exams from any public GitHub folder, or a folder on your computer while you write it. Nothing is uploaded and no account is needed.</p>
      {errors.length > 0 && (
        <div className="banner warning" role="alert">
          {errors.map((e) => (
            <div key={e}>{e}</div>
          ))}
        </div>
      )}
      <div className="hub-grid">
        <form className="card" onSubmit={submit} aria-label="Open from GitHub">
          <h2>Open a quiz from GitHub</h2>
          <div className="row">
            <input type="text" aria-label="GitHub folder URL" style={{ flex: 1, minWidth: '14rem' }} placeholder="https://github.com/owner/repo/tree/main/course-1/midterm" value={text} onChange={(e) => setText(e.target.value)} autoFocus spellCheck={false} />
            <button className="btn primary" type="submit">
              Open
            </button>
          </div>
          {error && <p className="field-error" role="alert">{error}</p>}
          <p className="muted" style={{ marginBottom: 0 }}>
            Paste a folder link, or <code>owner/repo/folder</code>. The folder must contain a <code>manifest.json</code>.
          </p>
          <details style={{ marginTop: '0.6rem' }}>
            <summary className="muted" style={{ cursor: 'pointer' }}>Branch, tag or folder override</summary>
            <div className="row" style={{ marginTop: '0.5rem' }}>
              <input type="text" aria-label="Branch, tag or commit" placeholder="branch / tag / commit (default main)" value={ref} onChange={(e) => setRef(e.target.value)} />
              <input type="text" aria-label="Folder inside the repository" placeholder="folder inside the repo" value={path} onChange={(e) => setPath(e.target.value)} />
            </div>
          </details>
        </form>

        <section className="card" aria-label="Local folder">
          <h2>Preview a local folder</h2>
          <p className="muted" style={{ marginTop: 0 }}>Test a quiz folder on your machine before you push it. Files are read in your browser and never leave it.</p>
          <button className="btn" onClick={pickLocal}>
            Load local folder
          </button>
          <input
            ref={fileInput}
            type="file"
            aria-label="Choose a quiz folder"
            hidden
            {...({ webkitdirectory: '' } as object)}
            multiple
            onChange={(e) => {
              if (e.target.files?.length) onOpenLocal(LocalFolderSource.fromFileList(e.target.files))
              e.target.value = ''
            }}
          />
          {supportsDirectoryPicker() && <p className="muted" style={{ marginBottom: 0 }}>Edits are picked up automatically when you come back to this tab.</p>}
        </section>

        <section className="card" aria-label="Sample">
          <h2>Not sure where to start?</h2>
          <p className="muted" style={{ marginTop: 0 }}>A small built-in quiz that shows every question type, the reference sheet and a custom theme.</p>
          <button className="btn" onClick={() => onOpenSpec({ kind: 'sample', name: 'demo' })}>
            Try the sample quiz
          </button>
        </section>

        {recent.length > 0 && (
          <section className="card" aria-label="Recent quizzes">
            <h2>Recent</h2>
            {recent.map((r) => (
              <div key={r.slug} className="recent-item">
                <button className="open" onClick={() => (r.source.kind === 'local' ? void pickLocal() : onOpenSpec(r.source))}>
                  <div className="title">{r.title}</div>
                  <div className="muted" style={{ fontSize: '0.85rem' }}>
                    {describe(r)}
                    {r.source.kind === 'local' ? ' · pick the folder again to reopen' : ''}
                  </div>
                </button>
                <button className="btn ghost small" aria-label={`Remove ${r.title} from recent`} onClick={() => onRemoveRecent(r.slug)}>
                  ✕
                </button>
              </div>
            ))}
          </section>
        )}
      </div>
    </div>
  )
}
