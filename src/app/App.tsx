import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Diagnostic } from '../core/model/types.ts'
import type { LoadedQuiz } from '../core/load/loadQuiz.ts'
import { BundledSource } from '../core/source/bundled.ts'
import { GitHubSource } from '../core/source/github.ts'
import type { LocalFolderSource } from '../core/source/local.ts'
import type { QuizSource, SourceSpec } from '../core/source/types.ts'
import type { ExamPreset } from '../core/share/preset.ts'
import { buildShareUrl, parseLocation } from '../core/share/url.ts'
import { AppStore, type KV } from '../core/storage/store.ts'
import { applyTheme } from '../core/theme/theme.ts'
import { LoadError } from '../features/DiagnosticsBanner.tsx'
import { Hub } from '../features/hub/Hub.tsx'
import { ToastProvider } from '../ui/Toast.tsx'

// The quiz screen (Markdown, KaTeX, syntax highlighting, drag-and-drop) and the validator are only needed once a quiz is opened.
const QuizScreen = lazy(() => import('./QuizScreen.tsx'))
const loadQuiz = async (src: QuizSource) => (await import('../core/load/loadQuiz.ts')).loadQuiz(src)

type State =
  | { status: 'hub'; errors: string[] }
  | { status: 'loading'; label: string }
  | { status: 'failed'; diagnostics: Diagnostic[]; retry?: () => void }
  | { status: 'ready'; quiz: LoadedQuiz; spec?: SourceSpec; preset?: ExamPreset }

/** localStorage can throw (privacy modes, disabled storage): fall back to memory so the app still works. */
function safeStorage(): KV {
  try {
    const k = '__quiz_probe__'
    window.localStorage.setItem(k, '1')
    window.localStorage.removeItem(k)
    return window.localStorage
  } catch {
    const m = new Map<string, string>()
    return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v), removeItem: (k) => void m.delete(k) }
  }
}

const baseUrl = () => window.location.origin + window.location.pathname

export function sourceFor(spec: SourceSpec): QuizSource {
  return spec.kind === 'sample' ? new BundledSource(spec.name, `${import.meta.env.BASE_URL}samples/${spec.name}/`) : new GitHubSource(spec)
}

const sameQuiz = (a: LoadedQuiz, b: LoadedQuiz) =>
  JSON.stringify([a.manifest, a.questions, a.reference, a.theme, a.diagnostics]) === JSON.stringify([b.manifest, b.questions, b.reference, b.theme, b.diagnostics])

export function App() {
  const kv = useMemo(safeStorage, [])
  const app = useMemo(() => new AppStore(kv), [kv])
  const [state, setState] = useState<State>({ status: 'hub', errors: [] })
  const [recent, setRecent] = useState(() => app.recent())
  const [reloading, setReloading] = useState(false)
  const source = useRef<QuizSource>(undefined)
  /** The query string the app last acted on. Hash-only navigation (next question, exam routes) also fires popstate and must not reopen the quiz. */
  const handledSearch = useRef<string | null>(null)
  const token = useRef(0)

  const resetChrome = () => {
    applyTheme(document.documentElement, undefined)
    document.title = 'Quiz'
  }

  const open = useCallback(
    async (src: QuizSource, spec?: SourceSpec, preset?: ExamPreset) => {
      const mine = ++token.current
      if (source.current && source.current !== src) source.current.dispose?.()
      source.current = src
      setState({ status: 'loading', label: src.label })
      const r = await loadQuiz(src)
      if (mine !== token.current) return
      if (!r.ok) {
        resetChrome()
        return setState({ status: 'failed', diagnostics: r.diagnostics, retry: () => void open(src, spec, preset) })
      }
      applyTheme(document.documentElement, r.quiz.theme)
      document.title = `${r.quiz.manifest.title} · Quiz`
      app.pushRecent({ slug: src.slug, source: spec ?? { kind: 'local', name: (src as LocalFolderSource).folderName }, title: r.quiz.manifest.title, openedAt: Date.now() })
      setRecent(app.recent())
      setState({ status: 'ready', quiz: r.quiz, spec, preset })
    },
    [app],
  )

  const openSpec = useCallback(
    (spec: SourceSpec, preset?: ExamPreset, push = true) => {
      if (push) history.pushState(null, '', buildShareUrl(baseUrl(), spec, preset))
      handledSearch.current = window.location.search
      void open(sourceFor(spec), spec, preset)
    },
    [open],
  )
  const openLocal = useCallback(
    (src: LocalFolderSource) => {
      history.pushState(null, '', baseUrl())
      handledSearch.current = window.location.search
      void open(src)
    },
    [open],
  )
  const goHub = useCallback(
    (errors: string[] = []) => {
      handledSearch.current = window.location.search
      token.current++
      source.current?.dispose?.()
      source.current = undefined
      resetChrome()
      setState({ status: 'hub', errors })
    },
    [],
  )

  // The address bar is the state: open what it names, now and on back/forward.
  useEffect(() => {
    const fromLocation = (push: boolean) => {
      const loc = parseLocation(window.location.search)
      if (loc.source) openSpec(loc.source, loc.preset, push)
      else goHub(loc.errors)
      if (loc.source && loc.errors.length) console.warn(loc.errors.join('\n'))
    }
    fromLocation(false)
    const onPop = () => {
      if (window.location.search !== handledSearch.current) fromLocation(false)
    }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [openSpec, goHub])

  const reload = useCallback(
    async (silent: boolean) => {
      const src = source.current
      if (!src?.canReload || !src.reload) return
      setReloading(true)
      try {
        const fresh = await src.reload()
        const r = await loadQuiz(fresh)
        source.current = fresh
        if (!r.ok) return setState({ status: 'failed', diagnostics: r.diagnostics, retry: () => void reload(false) })
        applyTheme(document.documentElement, r.quiz.theme)
        // Coming back to the tab must not wipe a half-typed answer when nothing changed on disk.
        setState((s) => (silent && s.status === 'ready' && sameQuiz(s.quiz, r.quiz) ? { ...s, quiz: { ...s.quiz, source: fresh } } : { status: 'ready', quiz: r.quiz, spec: undefined }))
      } catch (e) {
        setState({ status: 'failed', diagnostics: [{ severity: 'error', message: `Could not re-read the folder: ${(e as Error).message}`, hint: 'Pick the folder again from the start page.' }] })
      } finally {
        setReloading(false)
      }
    },
    [],
  )
  const canReload = state.status === 'ready' && source.current?.canReload === true
  // Also while the error screen is up: fix the file in your editor, come back, and the quiz recovers by itself.
  const watching = (state.status === 'ready' || state.status === 'failed') && source.current?.canReload === true
  useEffect(() => {
    if (!watching) return
    const onFocus = () => void reload(true)
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [watching, reload])

  const home = () => {
    history.pushState(null, '', baseUrl())
    goHub()
  }

  return (
    <ToastProvider>
      {state.status === 'hub' && (
        <Hub
          errors={state.errors}
          recent={recent}
          onOpenSpec={(s) => openSpec(s)}
          onOpenLocal={openLocal}
          onRemoveRecent={(slug) => {
            app.removeRecent(slug)
            setRecent(app.recent())
          }}
        />
      )}
      {state.status === 'loading' && (
        <div className="hub" role="status">
          <p>Loading {state.label}…</p>
        </div>
      )}
      {state.status === 'failed' && <LoadError diagnostics={state.diagnostics} onBack={home} onRetry={state.retry} />}
      {state.status === 'ready' && (
        <Suspense fallback={<div className="hub" role="status">Loading…</div>}>
          <QuizScreen quiz={state.quiz} spec={state.spec} preset={state.preset} kv={kv} onHome={home} onReload={canReload ? () => void reload(false) : undefined} reloading={reloading} />
        </Suspense>
      )}
    </ToastProvider>
  )
}
