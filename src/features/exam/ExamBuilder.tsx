import { useMemo, useState } from 'react'
import { configFromState, defaultBuilderState, presetFromConfig, stateFromPreset, type BuilderState } from '../../core/exam/config.ts'
import { sampleExam, type ExamConfig } from '../../core/exam/sample.ts'
import { QUESTION_TYPES } from '../../core/model/types.ts'
import { newSeed } from '../../core/random.ts'
import type { ExamPreset } from '../../core/share/preset.ts'
import { buildShareUrl } from '../../core/share/url.ts'
import { useQuiz } from '../../app/QuizContext.tsx'
import { NumberField } from '../../ui/NumberField.tsx'
import { copyText, useToast } from '../../ui/Toast.tsx'

const toggle = (list: string[], v: string) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v])
const DIFFS = ['easy', 'medium', 'hard']

export function ExamBuilder({ preset, onStart }: { preset?: ExamPreset; onStart(config: ExamConfig): void }) {
  const { quiz, store, spec } = useQuiz()
  const toast = useToast()
  const topics = quiz.manifest.topics
  const topicIds = topics.map((t) => t.id)
  const base = useMemo(() => defaultBuilderState(quiz.questions, topicIds, quiz.manifest.exam), [quiz]) // eslint-disable-line react-hooks/exhaustive-deps
  const [state, setState] = useState<BuilderState>(() => {
    if (preset) return stateFromPreset(preset, base)
    const saved = store.ui<{ exam?: Partial<BuilderState> }>({}).exam
    return saved ? { ...base, ...saved, topics: (saved.topics ?? base.topics).filter((t) => topicIds.includes(t)), lockSeed: false } : base
  })
  const [seed] = useState(() => preset?.seed ?? newSeed())
  const all = useMemo(() => ({ topics: topicIds, types: base.types }), [base]) // eslint-disable-line react-hooks/exhaustive-deps
  const config = configFromState(state, all, seed)
  const sample = useMemo(() => sampleExam(quiz.questions, topicIds, config), [quiz, state, seed]) // eslint-disable-line react-hooks/exhaustive-deps

  const set = (patch: Partial<BuilderState>) => setState((s) => ({ ...s, ...patch }))
  const available = (topic: string) => quiz.questions.filter((q) => q.topic === topic && state.types.includes(q.type) && (!q.difficulty ? state.difficulties.length === DIFFS.length : state.difficulties.includes(q.difficulty))).length
  const weightSum = state.topics.reduce((s, t) => s + (state.weights[t] ?? 0), 0)
  const typeLabel = (t: string) => QUESTION_TYPES.find((x) => x.type === t)?.label ?? t

  const share = async () => {
    if (!spec) return
    const url = buildShareUrl(window.location.origin + window.location.pathname, spec, presetFromConfig(config, state.lockSeed))
    toast((await copyText(url)) ? 'Share link copied' : 'Could not copy; select the address bar instead')
  }
  const start = () => {
    store.setUi({ ...store.ui({}), exam: state })
    onStart(config)
  }

  const exams = store.exams()
  return (
    <div className="stack">
      {preset && <div className="banner ok">Exam setup loaded from a shared link{preset.seed !== undefined ? ': you will get exactly the same questions and numbers as whoever shared it' : ''}. Adjust anything below, then start.</div>}
      <section className="card" aria-labelledby="exam-h">
        <h2 id="exam-h">Build an exam</h2>
        <div className="row" style={{ gap: '1.5rem', marginBottom: '1rem' }}>
          <label className="row">
            Questions
            <NumberField label="Number of questions" min={1} max={500} value={state.count} onChange={(v) => v !== undefined && set({ count: v })} />
          </label>
          <label className="row">
            Timer (minutes, 0 = none)
            <NumberField label="Timer in minutes" min={0} max={600} value={state.minutes} onChange={(v) => v !== undefined && set({ minutes: v })} />
          </label>
          <label className="row">
            <input type="checkbox" checked={state.shuffle} onChange={(e) => set({ shuffle: e.target.checked })} /> Mix topics
          </label>
        </div>

        <div className="filter-block">
          <span className="filter-label">Question types</span>
          <div className="chips">
            {base.types.map((t) => (
              <button key={t} className="chip" aria-pressed={state.types.includes(t)} onClick={() => set({ types: toggle(state.types, t) })}>
                {typeLabel(t)}
              </button>
            ))}
          </div>
        </div>
        <div className="filter-block">
          <span className="filter-label">Difficulty</span>
          <div className="chips">
            {DIFFS.map((d) => (
              <button key={d} className="chip" aria-pressed={state.difficulties.includes(d)} onClick={() => set({ difficulties: toggle(state.difficulties, d) })}>
                {d}
              </button>
            ))}
          </div>
        </div>

        <h3 style={{ marginTop: '1.2rem' }}>Topics and weights</h3>
        <p className="muted" style={{ marginTop: 0 }}>
          Give topics a percentage. Topics left on <em>auto</em> share what remains; if the weights add up to more than 100% they are scaled down. With no weights every question is equally likely.
        </p>
        <table className="weights-table">
          <thead>
            <tr>
              <th>Include</th>
              <th>Topic</th>
              <th>Matching questions</th>
              <th>Weight %</th>
              <th>In this exam</th>
            </tr>
          </thead>
          <tbody>
            {topics.map((t) => {
              const on = state.topics.includes(t.id)
              const alloc = sample.allocation[t.id]
              return (
                <tr key={t.id}>
                  <td>
                    <input type="checkbox" aria-label={`Include ${t.title}`} checked={on} onChange={() => set({ topics: toggle(state.topics, t.id) })} />
                  </td>
                  <td>{t.title}</td>
                  <td>{available(t.id)}</td>
                  <td>
                    <NumberField
                      label={`Weight for ${t.title}`}
                      min={0}
                      max={100}
                      allowEmpty
                      width="7.5rem"
                      disabled={!on}
                      placeholder={on && alloc ? `auto ${Math.round(alloc.share * 100)}` : 'auto'}
                      value={state.weights[t.id]}
                      onChange={(v) => {
                        const { [t.id]: _drop, ...rest } = state.weights
                        void _drop
                        set({ weights: v === undefined ? rest : { ...rest, [t.id]: v } })
                      }}
                    />
                  </td>
                  <td>{on ? (alloc?.got ?? 0) : '–'}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {weightSum > 0 && (
          <p className={weightSum > 100 ? 'field-error' : 'muted'}>
            Weights set: {weightSum}%{weightSum > 100 ? ' (will be scaled to 100%)' : weightSum < 100 ? `, ${100 - weightSum}% left for topics on auto` : ''}
          </p>
        )}
        {sample.warnings.map((w) => (
          <p key={w} className="banner warning" style={{ margin: '0.5rem 0 0' }}>
            {w}
          </p>
        ))}

        <div className="row" style={{ marginTop: '1.2rem' }}>
          <button className="btn primary" onClick={start} disabled={sample.ids.length === 0}>
            Start exam ({sample.ids.length} question{sample.ids.length === 1 ? '' : 's'}
            {state.minutes > 0 ? `, ${state.minutes} min` : ''})
          </button>
          <button className="btn" onClick={share} disabled={!spec} title={spec ? 'Copy a link that opens this quiz with this exam setup' : "Local folders can't be shared: push the quiz to GitHub first"}>
            Copy share link
          </button>
          <label className="row muted" title="Everyone who opens the link gets the same questions, order and numbers">
            <input type="checkbox" checked={state.lockSeed} onChange={(e) => set({ lockSeed: e.target.checked })} /> same questions for everyone
          </label>
        </div>
      </section>

      {exams.length > 0 && (
        <section className="card" aria-labelledby="hist-h">
          <h2 id="hist-h">Past exams</h2>
          <table className="weights-table">
            <thead>
              <tr>
                <th>When</th>
                <th>Score</th>
                <th>Questions</th>
                <th>Time</th>
              </tr>
            </thead>
            <tbody>
              {exams.slice(0, 10).map((e) => (
                <tr key={e.id}>
                  <td>{new Date(e.at).toLocaleString()}</td>
                  <td>
                    <strong>{Math.round(e.percent)}%</strong> <span className="muted">({Number(e.earned.toFixed(2))}/{e.possible})</span>
                  </td>
                  <td>{e.scores.length}</td>
                  <td>{Math.floor(e.seconds / 60)}m {e.seconds % 60}s</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </div>
  )
}
