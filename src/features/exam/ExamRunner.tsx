import { useEffect, useMemo, useRef, useState } from 'react'
import type { ExamConfig } from '../../core/exam/sample.ts'
import { sampleExam } from '../../core/exam/sample.ts'
import type { Answer } from '../../core/model/types.ts'
import { emptyAnswer, instantiate, type Instance } from '../../core/question-types/index.ts'
import { deriveSeed } from '../../core/random.ts'
import { useQuiz } from '../../app/QuizContext.tsx'
import { ConfirmDialog } from '../../ui/Drawer.tsx'
import { QuestionCard } from '../question/QuestionCard.tsx'
import { gradeAll, isAnswered, scoresOf, type ExamOutcome } from './types.ts'

const fmt = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000))
  return `${Math.floor(s / 3600) ? `${Math.floor(s / 3600)}:` : ''}${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}

const typing = (t: EventTarget | null) => {
  const el = t as HTMLElement | null
  return !!el && (/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) || el.isContentEditable)
}

export function ExamRunner({ config, onFinish }: { config: ExamConfig; onFinish(o: ExamOutcome): void }) {
  const { quiz, store, record, topicTitle } = useQuiz()
  const topicIds = quiz.manifest.topics.map((t) => t.id)
  // Fixed for the whole exam: the same (config, seed) always gives the same questions, order, numbers and shuffles.
  const questions = useMemo(() => {
    const ids = sampleExam(quiz.questions, topicIds, config).ids
    const byId = new Map(quiz.questions.map((q) => [q.id, q]))
    return ids.map((id) => byId.get(id)!)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  const instances = useMemo(() => Object.fromEntries(questions.map((q) => [q.id, instantiate(q, deriveSeed(config.seed, q.id))])) as Record<string, Instance>, [questions, config.seed])
  const [answers, setAnswers] = useState<Record<string, Answer>>(() => Object.fromEntries(questions.map((q) => [q.id, emptyAnswer(instances[q.id])])))
  const [flags, setFlags] = useState<Set<string>>(new Set())
  const [idx, setIdx] = useState(0)
  const [confirm, setConfirm] = useState(false)
  const started = useRef(Date.now())
  const deadline = config.minutes ? started.current + config.minutes * 60_000 : undefined
  const [now, setNow] = useState(Date.now())
  const finished = useRef(false)

  const finish = (auto = false) => {
    if (finished.current) return
    finished.current = true
    void auto
    const { grades, score } = gradeAll(questions, instances, answers)
    const seconds = Math.round((Math.min(Date.now(), deadline ?? Infinity) - started.current) / 1000)
    const result = { ...score, id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, at: Date.now(), config, seconds, scores: scoresOf(questions, grades) }
    store.addExam(result)
    for (const q of questions) if (grades[q.id]) record(q.id, grades[q.id]!, instances[q.id].seed)
    onFinish({ result, questions, instances, answers, unanswered: questions.filter((q) => !grades[q.id]).map((q) => q.id), flags: [...flags] })
  }
  const finishRef = useRef(finish)
  finishRef.current = finish

  useEffect(() => {
    const t = setInterval(() => {
      const n = Date.now()
      setNow(n)
      if (deadline !== undefined && n >= deadline) finishRef.current(true)
    }, 500)
    return () => clearInterval(t)
  }, [deadline])

  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (!finished.current) e.preventDefault()
    }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (confirm || e.ctrlKey || e.metaKey || e.altKey || typing(e.target)) return
      if (e.key === 'j' || e.key === 'ArrowRight') setIdx((i) => Math.min(questions.length - 1, i + 1))
      else if (e.key === 'k' || e.key === 'ArrowLeft') setIdx((i) => Math.max(0, i - 1))
      else if (e.key === 'f') toggleFlag(questions[idx].id)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const toggleFlag = (id: string) =>
    setFlags((f) => {
      const n = new Set(f)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })

  const q = questions[idx]
  const answeredCount = questions.filter((x) => isAnswered(instances[x.id], answers[x.id])).length
  const remaining = deadline !== undefined ? deadline - now : undefined
  return (
    <div>
      <div className="nav-bar">
        <strong>Exam</strong>
        <span className="muted">
          {answeredCount}/{questions.length} answered{flags.size > 0 ? ` · ${flags.size} flagged` : ''}
        </span>
        <span className="spacer" />
        {remaining !== undefined && (
          <span className={`timer ${remaining < 60_000 ? 'low' : ''}`} role="timer" aria-label="Time remaining">
            {fmt(remaining)}
          </span>
        )}
        <button className="btn primary" onClick={() => setConfirm(true)}>
          Submit exam
        </button>
      </div>
      <div className="exam-layout">
        <div>
          <QuestionCard
            key={q.id}
            inst={instances[q.id]}
            answer={answers[q.id]}
            onAnswer={(a) => setAnswers((s) => ({ ...s, [q.id]: a }))}
            mode="exam"
            topicTitle={topicTitle(q.topic)}
            flagged={flags.has(q.id)}
            onFlag={() => toggleFlag(q.id)}
            position={<span className="muted">{idx + 1} / {questions.length}</span>}
          />
          <div className="row" style={{ marginTop: '1rem' }}>
            <button className="btn" disabled={idx === 0} onClick={() => setIdx(idx - 1)}>
              ← Previous
            </button>
            <button className="btn" disabled={idx === questions.length - 1} onClick={() => setIdx(idx + 1)}>
              Next →
            </button>
          </div>
        </div>
        <aside className="card navigator" aria-label="Question navigator">
          <h3>Questions</h3>
          <div className="nav-grid">
            {questions.map((x, i) => (
              <button key={x.id} className={`nav-cell ${isAnswered(instances[x.id], answers[x.id]) ? 'answered' : ''} ${i === idx ? 'current' : ''} ${flags.has(x.id) ? 'flagged' : ''}`} aria-label={`Question ${i + 1}${isAnswered(instances[x.id], answers[x.id]) ? ', answered' : ''}${flags.has(x.id) ? ', flagged' : ''}`} aria-current={i === idx} onClick={() => setIdx(i)}>
                {i + 1}
              </button>
            ))}
          </div>
          <p className="muted" style={{ fontSize: '0.8rem', marginBottom: 0 }}>
            Shaded = answered · dot = flagged for review
          </p>
        </aside>
      </div>
      {confirm && (
        <ConfirmDialog title="Submit the exam?" confirmLabel="Submit" cancelLabel="Keep working" onConfirm={() => finish()} onCancel={() => setConfirm(false)}>
          <p style={{ marginTop: 0 }}>
            {questions.length - answeredCount > 0 ? <><strong>{questions.length - answeredCount}</strong> unanswered question(s) will score 0. </> : 'All questions are answered. '}
            {flags.size > 0 && <><strong>{flags.size}</strong> flagged for review. </>}
            You will not be able to change your answers afterwards.
          </p>
        </ConfirmDialog>
      )}
    </div>
  )
}
