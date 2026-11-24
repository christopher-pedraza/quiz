import { useEffect, useMemo, useState } from 'react'
import { EMPTY_FILTERS, filterQuestions, isFiltering, type Filters } from '../core/filter.ts'
import type { ExamConfig } from '../core/exam/sample.ts'
import type { ExamPreset } from '../core/share/preset.ts'
import { buildShareUrl } from '../core/share/url.ts'
import { DiagnosticsBanner } from '../features/DiagnosticsBanner.tsx'
import { ExamBuilder } from '../features/exam/ExamBuilder.tsx'
import { ExamResults } from '../features/exam/ExamResults.tsx'
import { ExamRunner } from '../features/exam/ExamRunner.tsx'
import type { ExamOutcome } from '../features/exam/types.ts'
import { Practice } from '../features/practice/Practice.tsx'
import { QuestionBrowser } from '../features/practice/QuestionBrowser.tsx'
import { ReferenceDrawer } from '../features/reference/ReferenceDrawer.tsx'
import { ConfirmDialog, Drawer } from '../ui/Drawer.tsx'
import { copyText, useToast } from '../ui/Toast.tsx'
import { useRoute } from './hash.ts'
import { useQuiz } from './QuizContext.tsx'

type Overlay = 'browser' | 'reference' | 'help' | null

const SHORTCUTS: [string, string][] = [
  ['j / →', 'Next question'],
  ['k / ←', 'Previous question'],
  ['n', 'Next unanswered question'],
  ['/  or  Ctrl/⌘ K', 'Search and filter questions'],
  ['f', 'Flag or unflag the question'],
  ['h', 'Show the next hint'],
  ['1 – 9', 'Pick the n-th choice (multiple choice)'],
  ['Ctrl/⌘ Enter', 'Check the answer / try again'],
  ['r', 'Open the reference sheet'],
  ['?', 'Show this help'],
]

const typing = (t: EventTarget | null) => {
  const el = t as HTMLElement | null
  return !!el && (/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) || el.isContentEditable)
}

interface Props {
  preset?: ExamPreset
  onHome(): void
  /** Local folders opened with a directory handle can be re-read. */
  onReload?: () => void
  reloading?: boolean
}

export function QuizShell({ preset, onHome, onReload, reloading }: Props) {
  const { quiz, store, attempts, flags, spec } = useQuiz()
  const toast = useToast()
  const [route, navigate] = useRoute()
  const [overlay, setOverlay] = useState<Overlay>(null)
  const [refFocus, setRefFocus] = useState<string>()
  const [filters, setFilters] = useState<Filters>(() => ({ ...EMPTY_FILTERS, ...store.ui<{ filters?: Partial<Filters> }>({}).filters }))
  const [examConfig, setExamConfig] = useState<ExamConfig | null>(null)
  const [outcome, setOutcome] = useState<ExamOutcome | null>(null)
  const [leaving, setLeaving] = useState(false)

  const saveUi = (patch: object) => store.setUi({ ...store.ui({}), ...patch })
  useEffect(() => saveUi({ filters }), [filters]) // eslint-disable-line react-hooks/exhaustive-deps

  const list = useMemo(() => filterQuestions(quiz.questions, filters, { attempts, flags, topics: quiz.manifest.topics }), [quiz, filters, attempts, flags])
  const examRunning = route.view === 'run' && examConfig !== null

  // An exam link opens the exam builder directly.
  useEffect(() => {
    if (preset && route.view === 'practice' && !route.qid) navigate({ view: 'exam' }, true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  // Routes that need state we do not have fall back to the builder.
  useEffect(() => {
    if (route.view === 'run' && !examConfig) navigate({ view: 'exam' }, true)
    if (route.view === 'result' && !outcome) navigate({ view: 'exam' }, true)
  }, [route.view, examConfig, outcome, navigate])

  const openReference = (name?: string) => {
    if (!quiz.reference) return
    setRefFocus(name)
    setOverlay('reference')
  }
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (overlay) return
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        if (!examRunning) setOverlay('browser')
      } else if (!e.ctrlKey && !e.metaKey && !e.altKey && !typing(e.target)) {
        if (e.key === '/' && !examRunning) (e.preventDefault(), setOverlay('browser'))
        else if (e.key === 'r' && !examRunning) openReference()
        else if (e.key === '?') setOverlay('help')
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const share = async () => {
    if (!spec) return
    const ok = await copyText(buildShareUrl(window.location.origin + window.location.pathname, spec))
    toast(ok ? 'Share link copied' : 'Could not copy; copy the address bar instead')
  }
  const goHome = () => (examRunning ? setLeaving(true) : onHome())
  const pickQuestion = (id: string) => {
    setOverlay(null)
    navigate({ view: 'practice', qid: id })
  }

  return (
    <>
      <header className="app-header">
        <button className="btn ghost icon-btn" onClick={goHome} aria-label="Back to start" title="Back to start">
          ←
        </button>
        <h1 title={quiz.manifest.title}>{quiz.manifest.title}</h1>
        <div className="tabs" role="tablist" aria-label="Mode">
          <button role="tab" aria-selected={route.view === 'practice'} disabled={examRunning} onClick={() => navigate({ view: 'practice' })}>
            Practice
          </button>
          <button role="tab" aria-selected={route.view !== 'practice'} disabled={examRunning} onClick={() => navigate({ view: outcome && route.view === 'result' ? 'result' : 'exam' })}>
            Exam
          </button>
        </div>
        <span className="spacer" />
        {!examRunning && (
          <button className="btn" onClick={() => setOverlay('browser')} title="Search and filter (/)">
            {isFiltering(filters) ? `Filtered · ${list.length}/${quiz.questions.length}` : `Browse · ${quiz.questions.length}`}
          </button>
        )}
        {quiz.reference && !examRunning && (
          <button className="btn" onClick={() => openReference()} title="Reference sheet (r)">
            Reference
          </button>
        )}
        {onReload && (
          <button className="btn" onClick={onReload} disabled={reloading} title="Re-read the local folder (also happens when you return to this tab)">
            {reloading ? 'Reloading…' : '↻ Reload'}
          </button>
        )}
        <button className="btn" onClick={share} disabled={!spec} title={spec ? 'Copy a link to this quiz' : "Local folders can't be shared: push the quiz to GitHub first"}>
          Copy share link
        </button>
        <button className="btn ghost icon-btn" onClick={() => setOverlay('help')} aria-label="Keyboard shortcuts" title="Keyboard shortcuts (?)">
          ?
        </button>
      </header>
      <DiagnosticsBanner diagnostics={quiz.diagnostics} skipped={quiz.skipped} />
      <main className="page">
        {route.view === 'practice' && (
          <Practice
            list={list}
            qid={route.qid}
            navigate={(id, replace) => navigate({ view: 'practice', qid: id }, replace)}
            openReference={openReference}
            keysEnabled={!overlay}
            startId={store.ui<{ last?: string }>({}).last}
            onVisit={(id) => saveUi({ last: id })}
            filtering={isFiltering(filters)}
            onClearFilters={() => setFilters(EMPTY_FILTERS)}
          />
        )}
        {route.view === 'exam' && (
          <>
            {!quiz.questions.length ? null : (
              <ExamBuilder
                preset={preset}
                onStart={(c) => {
                  setExamConfig(c)
                  setOutcome(null)
                  navigate({ view: 'run' })
                }}
              />
            )}
          </>
        )}
        {route.view === 'run' && examConfig && (
          <ExamRunner
            config={examConfig}
            onFinish={(o) => {
              setOutcome(o)
              setExamConfig(null)
              navigate({ view: 'result' }, true)
            }}
          />
        )}
        {route.view === 'result' && outcome && (
          <ExamResults
            outcome={outcome}
            onNewExam={() => navigate({ view: 'exam' })}
            onPracticeMissed={() => {
              setFilters({ ...EMPTY_FILTERS, statuses: ['incorrect'] })
              navigate({ view: 'practice' })
            }}
          />
        )}
      </main>
      {overlay === 'browser' && <QuestionBrowser filters={filters} onFilters={setFilters} list={list} currentId={route.view === 'practice' ? route.qid : undefined} onPick={pickQuestion} onClose={() => setOverlay(null)} />}
      {overlay === 'reference' && quiz.reference && <ReferenceDrawer reference={quiz.reference} focus={refFocus} onClose={() => setOverlay(null)} />}
      {overlay === 'help' && (
        <Drawer title="Keyboard shortcuts" variant="center" onClose={() => setOverlay(null)}>
          <table className="weights-table">
            <tbody>
              {SHORTCUTS.map(([k, d]) => (
                <tr key={k}>
                  <td>
                    <kbd>{k}</kbd>
                  </td>
                  <td>{d}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Drawer>
      )}
      {leaving && (
        <ConfirmDialog title="Leave the exam?" confirmLabel="Leave and lose answers" cancelLabel="Stay" onConfirm={onHome} onCancel={() => setLeaving(false)}>
          Your answers in this exam have not been submitted and will be lost.
        </ConfirmDialog>
      )}
    </>
  )
}
