import { useState } from 'react'
import { useQuiz } from '../../app/QuizContext.tsx'
import { ConfirmDialog } from '../../ui/Drawer.tsx'
import { useToast } from '../../ui/Toast.tsx'

/** "Reset progress…" button + confirmation. Only this quiz's saved data is touched. */
export function ResetProgress({ onDone }: { onDone?: () => void }) {
  const { attempts, flags, store, resetProgress } = useQuiz()
  const toast = useToast()
  const [open, setOpen] = useState(false)
  const [what, setWhat] = useState({ attempts: true, flags: true, exams: true })
  const answered = Object.keys(attempts).length
  const exams = store.exams().length
  const nothing = answered === 0 && flags.size === 0 && exams === 0
  const row = (key: keyof typeof what, label: string, count: number) => (
    <label className="row" style={{ margin: '0.3rem 0' }}>
      <input type="checkbox" checked={what[key]} onChange={(e) => setWhat({ ...what, [key]: e.target.checked })} />
      <span>
        {label} <span className="muted">({count})</span>
      </span>
    </label>
  )
  return (
    <>
      <button className="btn small ghost" onClick={() => setOpen(true)} disabled={nothing} title={nothing ? 'Nothing to reset yet' : 'Forget your results, flags and exam history for this quiz'}>
        Reset progress…
      </button>
      {open && (
        <ConfirmDialog
          title="Reset progress for this quiz?"
          confirmLabel="Reset"
          onCancel={() => setOpen(false)}
          onConfirm={() => {
            resetProgress(what)
            setOpen(false)
            toast('Progress reset')
            onDone?.()
          }}
        >
          <p style={{ marginTop: 0 }}>Choose what to forget. This cannot be undone and only affects this quiz in this browser.</p>
          {row('attempts', 'Answered / correct / incorrect status', answered)}
          {row('flags', 'Flagged questions', flags.size)}
          {row('exams', 'Past exam results', exams)}
        </ConfirmDialog>
      )}
    </>
  )
}
