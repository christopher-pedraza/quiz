import { useEffect, useRef } from 'react'
import { isFiltering, EMPTY_FILTERS, statusKey, type Filters, type StatusFilter } from '../../core/filter.ts'
import { QUESTION_TYPES, type Difficulty, type Question, type QuestionType } from '../../core/model/types.ts'
import { Drawer } from '../../ui/Drawer.tsx'
import { useQuiz } from '../../app/QuizContext.tsx'
import { ResetProgress } from './ResetProgress.tsx'

const toggle = <T,>(list: T[], v: T): T[] => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v])
const STATUSES: { id: StatusFilter; label: string }[] = [
  { id: 'unanswered', label: 'Unanswered' },
  { id: 'incorrect', label: 'Incorrect' },
  { id: 'correct', label: 'Correct' },
  { id: 'flagged', label: 'Flagged' },
]

interface Props {
  filters: Filters
  onFilters(f: Filters): void
  list: Question[]
  currentId?: string
  onPick(id: string): void
  onClose(): void
}

/** Search + filter + jump. Every filter here also decides what Next/Previous walk through. */
export function QuestionBrowser({ filters, onFilters, list, currentId, onPick, onClose }: Props) {
  const { quiz, attempts, flags, topicTitle } = useQuiz()
  const present = new Set(quiz.questions.map((q) => q.type))
  const search = useRef<HTMLInputElement>(null)
  useEffect(() => search.current?.focus(), [])
  const set = (patch: Partial<Filters>) => onFilters({ ...filters, ...patch })
  const typeLabel = (t: string) => QUESTION_TYPES.find((x) => x.type === t)?.label ?? t
  return (
    <Drawer title={`Questions (${list.length}/${quiz.questions.length})`} onClose={onClose} initialFocus="input[type=search]">
      <input
        ref={search}
        type="search"
        aria-label="Search questions"
        placeholder="Search by keyword, tag or id…"
        style={{ width: '100%', marginBottom: '0.9rem' }}
        value={filters.query}
        onChange={(e) => set({ query: e.target.value })}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && list[0]) onPick(list[0].id)
        }}
      />
      <div className="filter-block">
        <span className="filter-label">Status</span>
        <div className="chips">
          {STATUSES.map((s) => (
            <button key={s.id} className="chip" aria-pressed={filters.statuses.includes(s.id)} onClick={() => set({ statuses: toggle(filters.statuses, s.id) })}>
              {s.label}
            </button>
          ))}
        </div>
      </div>
      {quiz.manifest.topics.length > 1 && (
        <div className="filter-block">
          <span className="filter-label">Topic</span>
          <div className="chips">
            {quiz.manifest.topics.map((t) => (
              <button key={t.id} className="chip" aria-pressed={filters.topics.includes(t.id)} onClick={() => set({ topics: toggle(filters.topics, t.id) })}>
                {t.title}
              </button>
            ))}
          </div>
        </div>
      )}
      <div className="filter-block">
        <span className="filter-label">Type</span>
        <div className="chips">
          {QUESTION_TYPES.filter((t) => present.has(t.type)).map((t) => (
            <button key={t.type} className="chip" aria-pressed={filters.types.includes(t.type)} onClick={() => set({ types: toggle<QuestionType>(filters.types, t.type) })}>
              {t.label}
            </button>
          ))}
        </div>
      </div>
      <div className="filter-block">
        <span className="filter-label">Difficulty</span>
        <div className="chips">
          {(['easy', 'medium', 'hard'] as Difficulty[]).map((d) => (
            <button key={d} className="chip" aria-pressed={filters.difficulties.includes(d)} onClick={() => set({ difficulties: toggle(filters.difficulties, d) })}>
              {d}
            </button>
          ))}
        </div>
      </div>
      <div className="row" style={{ marginBottom: '0.8rem' }}>
        {isFiltering(filters) && (
          <button className="btn small" onClick={() => onFilters(EMPTY_FILTERS)}>
            Clear filters
          </button>
        )}
        <span className="spacer" />
        <ResetProgress />
      </div>
      {list.length === 0 ? (
        <p className="muted">No question matches these filters.</p>
      ) : (
        <ul className="q-list" aria-label="Matching questions">
          {list.map((q) => {
            const s = statusKey(q.id, { attempts })
            return (
              <li key={q.id}>
                <button className="q-item" aria-current={q.id === currentId} onClick={() => onPick(q.id)}>
                  <span className={`dot ${s}`} title={s} />
                  <span className="t">
                    <div>{q.title ?? q.id}</div>
                    <div className="meta">
                      {topicTitle(q.topic)} · {typeLabel(q.type)}
                      {q.difficulty ? ` · ${q.difficulty}` : ''}
                    </div>
                  </span>
                  {flags.has(q.id) && <span title="flagged">⚑</span>}
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </Drawer>
  )
}
