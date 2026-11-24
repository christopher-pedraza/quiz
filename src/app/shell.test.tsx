// @vitest-environment jsdom
import { act, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { QuizShell } from './QuizShell.tsx'
import { manifest, mcq, memoryKv, renderQuiz } from './testkit.tsx'

const bank = [
  mcq('a1', 'a', { hints: ['first hint', 'second hint'], explanation: 'Because reasons.' }),
  mcq('a2', 'a'),
  mcq('b1', 'b', { difficulty: 'hard', tags: ['special'] }),
  { type: 'calculation', id: 'calc', topic: 'b', title: 'Random calc', prompt: 'Compute {{x}} + 1', variables: { x: { min: 1, max: 9 } }, parts: [{ id: 'p', formula: 'x + 1' }] },
  { type: 'fill-blank', id: 'drag', topic: 'b', title: 'Drag blanks', mode: 'drag', template: 'The <<BLANK:a>> sort.', blanks: [{ id: 'a', answers: ['merge'] }], distractors: ['bubble'] },
  { type: 'short-answer', id: 'sa', topic: 'a', title: 'Explain', prompt: 'Explain', modelAnswer: 'Model!', rubric: [{ text: 'point one' }, { text: 'point two' }] },
]
const files = (extra: object = {}) => ({ 'manifest.json': manifest(extra), 'q.json': bank })
const shell = (preset?: object) => <QuizShell onHome={() => {}} preset={preset as never} />

beforeEach(() => {
  window.location.hash = ''
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

const title = () => screen.getByRole('heading', { level: 2 }).textContent

describe('practice', () => {
  it('opens on the first unanswered question, checks an answer, records it and shows the explanation', async () => {
    const u = userEvent.setup()
    const { kv } = await renderQuiz(files(), shell())
    expect(title()).toBe('Title a1')
    await u.click(screen.getByLabelText(/right a1/))
    await u.click(screen.getByRole('button', { name: 'Check answer' }))
    expect(document.querySelector('.verdict')!.textContent).toBe('Correct!')
    expect(screen.getByText('Because reasons.')).toBeTruthy()
    const saved = JSON.parse(kv.data.get('quiz:v1:memory:testkit:attempts')!)
    expect(saved.a1).toMatchObject({ score: 1, best: 1, attempts: 1 })
  })

  it('navigates with the buttons and the j/k keys, and resumes at the last question', async () => {
    const u = userEvent.setup()
    const kv = memoryKv()
    const first = await renderQuiz(files(), shell(), { kv })
    await u.click(screen.getByRole('button', { name: /Next question/ }))
    expect(title()).toBe('Title a2')
    await u.keyboard('j')
    expect(title()).toBe('Title b1')
    await u.keyboard('k')
    expect(title()).toBe('Title a2')
    first.unmount()
    window.location.hash = ''
    await renderQuiz(files(), shell(), { kv })
    expect(title()).toBe('Title a2')
  })

  it('shows hints one at a time', async () => {
    const u = userEvent.setup()
    await renderQuiz(files(), shell())
    await u.click(screen.getByRole('button', { name: 'Hint (0/2)' }))
    expect(screen.getByText('first hint')).toBeTruthy()
    expect(screen.queryByText('second hint')).toBeNull()
    await u.keyboard('h')
    expect(screen.getByText('second hint')).toBeTruthy()
  })

  it('flags with the button and the f key; the flag survives in storage', async () => {
    const u = userEvent.setup()
    const { kv } = await renderQuiz(files(), shell())
    await u.click(screen.getByRole('button', { name: /Flag/ }))
    expect(screen.getByRole('button', { name: /Flagged/ })).toBeTruthy()
    expect(JSON.parse(kv.data.get('quiz:v1:memory:testkit:flags')!)).toEqual(['a1'])
    await u.keyboard('f')
    expect(screen.getByRole('button', { name: /⚐ Flag/ })).toBeTruthy()
  })

  it('Ctrl+Enter checks, then tries again', async () => {
    const u = userEvent.setup()
    await renderQuiz(files(), shell())
    await u.click(screen.getByLabelText(/wrong a1/))
    await u.keyboard('{Control>}{Enter}{/Control}')
    expect(document.querySelector('.verdict')!.textContent).toBe('Not quite.')
    await u.keyboard('{Control>}{Enter}{/Control}')
    expect(document.querySelector('.verdict')).toBeNull()
  })

  it('a randomized question can be re-rolled, and the new numbers are graded', async () => {
    const u = userEvent.setup()
    await renderQuiz(files(), shell())
    window.location.hash = '#/practice/calc'
    await waitFor(() => expect(title()).toBe('Random calc'))
    const prompt = () => document.querySelector('.md')!.textContent
    const seen = new Set<string>()
    for (let i = 0; i < 12; i++) {
      seen.add(prompt()!)
      await u.click(screen.getByRole('button', { name: /New numbers/ }))
    }
    expect(seen.size).toBeGreaterThan(1)
    const x = Number(/Compute (\d+) \+ 1/.exec(prompt()!)![1])
    await u.type(screen.getByRole('textbox'), String(x + 1))
    await u.click(screen.getByRole('button', { name: 'Check answer' }))
    expect(document.querySelector('.verdict')!.textContent).toBe('Correct!')
  })

  it('keeps the answer when a drag-and-drop blank is filled by clicking (regression: session was orphaned on mount)', async () => {
    const u = userEvent.setup()
    await renderQuiz(files(), shell())
    window.location.hash = '#/practice/drag'
    await waitFor(() => expect(title()).toBe('Drag blanks'))
    await u.click(within(screen.getByRole('group', { name: 'Word bank' })).getByRole('button', { name: 'merge' }))
    await u.click(screen.getByRole('group', { name: 'Blank a' }))
    expect(within(screen.getByRole('group', { name: 'Blank a' })).getByRole('button', { name: 'merge' })).toBeTruthy()
    await u.click(screen.getByRole('button', { name: 'Check answer' }))
    expect(document.querySelector('.verdict')!.textContent).toBe('Correct!')
  })

  it('short answer: reveal, self-grade, and only then is it recorded as graded', async () => {
    const u = userEvent.setup()
    const { kv } = await renderQuiz(files(), shell())
    window.location.hash = '#/practice/sa'
    await waitFor(() => expect(title()).toBe('Explain'))
    await u.type(screen.getByLabelText('Your answer'), 'my thoughts')
    await u.click(screen.getByRole('button', { name: 'Check answer' }))
    expect(screen.getByText('Model!')).toBeTruthy()
    expect(JSON.parse(kv.data.get('quiz:v1:memory:testkit:attempts')!).sa.pending).toBe(true)
    await u.click(screen.getByLabelText('point one'))
    await u.click(screen.getByRole('button', { name: 'Save my grade' }))
    expect(document.querySelector('.verdict')!.textContent).toBe('Partly correct: 50%')
    const sa = JSON.parse(kv.data.get('quiz:v1:memory:testkit:attempts')!).sa
    expect(sa).toMatchObject({ score: 0.5 })
    expect(sa.pending).toBeUndefined()
  })
})

describe('browser drawer', () => {
  it('filters by keyword, topic, difficulty and status, and those filters drive next/previous', async () => {
    const u = userEvent.setup()
    await renderQuiz(files(), shell())
    await u.keyboard('/')
    const dialog = screen.getByRole('dialog', { name: /Questions/ })
    expect(within(dialog).getAllByRole('button', { name: /Title|Random|Drag|Explain/ })).toHaveLength(6)
    await u.type(within(dialog).getByLabelText('Search questions'), 'special')
    expect(within(dialog).getAllByRole('listitem')).toHaveLength(1)
    await u.clear(within(dialog).getByLabelText('Search questions'))
    await u.click(within(dialog).getByRole('button', { name: 'Beta' }))
    expect(within(dialog).getAllByRole('listitem')).toHaveLength(3)
    await u.click(within(dialog).getByRole('button', { name: 'hard' }))
    expect(within(dialog).getAllByRole('listitem')).toHaveLength(1)
    await u.click(within(dialog).getByRole('button', { name: 'Clear filters' }))
    await u.click(within(dialog).getByRole('button', { name: 'Flagged' }))
    expect(within(dialog).getByText('No question matches these filters.')).toBeTruthy()
    await u.click(within(dialog).getByRole('button', { name: 'Clear filters' }))
    await u.type(within(dialog).getByLabelText('Search questions'), 'drag')
    await u.click(within(dialog).getByRole('button', { name: /Drag blanks/ }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(title()).toBe('Drag blanks')
  })

  it('Escape closes it, Ctrl+K opens it, and Status filters track answered questions', async () => {
    const u = userEvent.setup()
    await renderQuiz(files(), shell())
    await u.click(screen.getByLabelText(/right a1/))
    await u.click(screen.getByRole('button', { name: 'Check answer' }))
    await u.keyboard('{Control>}k{/Control}')
    const dialog = screen.getByRole('dialog')
    await u.click(within(dialog).getByRole('button', { name: 'Correct' }))
    expect(within(dialog).getAllByRole('listitem')).toHaveLength(1)
    await u.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.getByRole('button', { name: /Filtered · 1\/6/ })).toBeTruthy()
  })
})

describe('resetting progress', () => {
  const answerWrong = async (u: ReturnType<typeof userEvent.setup>) => {
    await u.click(screen.getByLabelText(/wrong a1/))
    await u.click(screen.getByRole('button', { name: 'Check answer' }))
  }
  const openReset = async (u: ReturnType<typeof userEvent.setup>) => {
    await u.keyboard('/')
    return screen.getByRole('dialog', { name: /Questions/ })
  }

  it('the status filters reflect results, and Reset progress clears them (and the verdict on screen)', async () => {
    const u = userEvent.setup()
    const { kv } = await renderQuiz(files(), shell())
    await answerWrong(u)
    await u.click(screen.getByRole('button', { name: /Flag/ }))
    let dialog = await openReset(u)
    await u.click(within(dialog).getByRole('button', { name: 'Incorrect' }))
    expect(within(dialog).getAllByRole('listitem')).toHaveLength(1)
    await u.click(within(dialog).getByRole('button', { name: 'Reset progress…' }))

    const confirm = screen.getByRole('dialog', { name: 'Reset progress for this quiz?' })
    expect(within(confirm).getByLabelText(/Answered/).closest('label')!.textContent).toContain('(1)')
    await u.click(within(confirm).getByRole('button', { name: 'Reset' }))

    expect(await screen.findByText('Progress reset')).toBeTruthy()
    expect(kv.data.get('quiz:v1:memory:testkit:attempts')).toBeUndefined()
    expect(kv.data.get('quiz:v1:memory:testkit:flags')).toBeUndefined()
    dialog = screen.getByRole('dialog', { name: /Questions/ })
    expect(within(dialog).getByText('No question matches these filters.')).toBeTruthy() // "Incorrect" is empty now
    await u.keyboard('{Escape}')
    expect(document.querySelector('.verdict')).toBeNull() // the on-screen result is gone too
    expect(screen.getByRole('button', { name: /⚐ Flag/ })).toBeTruthy()
  })

  it('lets you keep some things: unticked boxes survive', async () => {
    const u = userEvent.setup()
    const { kv } = await renderQuiz(files(), shell())
    await answerWrong(u)
    await u.click(screen.getByRole('button', { name: /Flag/ }))
    const dialog = await openReset(u)
    await u.click(within(dialog).getByRole('button', { name: 'Reset progress…' }))
    const confirm = screen.getByRole('dialog', { name: 'Reset progress for this quiz?' })
    await u.click(within(confirm).getByLabelText(/Flagged questions/))
    await u.click(within(confirm).getByRole('button', { name: 'Reset' }))
    expect(kv.data.get('quiz:v1:memory:testkit:attempts')).toBeUndefined()
    expect(JSON.parse(kv.data.get('quiz:v1:memory:testkit:flags')!)).toEqual(['a1'])
  })

  it('cancel changes nothing; with nothing saved the button is disabled', async () => {
    const u = userEvent.setup()
    const { kv } = await renderQuiz(files(), shell())
    let dialog = await openReset(u)
    expect((within(dialog).getByRole('button', { name: 'Reset progress…' }) as HTMLButtonElement).disabled).toBe(true)
    await u.keyboard('{Escape}')
    await answerWrong(u)
    dialog = await openReset(u)
    await u.click(within(dialog).getByRole('button', { name: 'Reset progress…' }))
    await u.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(kv.data.get('quiz:v1:memory:testkit:attempts')).toBeTruthy()
  })

  it('"Forget my result" resets just the current question', async () => {
    const u = userEvent.setup()
    const { kv } = await renderQuiz(files(), shell())
    await answerWrong(u)
    await u.click(screen.getByRole('button', { name: 'Next question (j)' }))
    await u.click(screen.getByLabelText(/right a2/))
    await u.click(screen.getByRole('button', { name: 'Check answer' }))
    await u.click(screen.getByRole('button', { name: 'Forget my result' }))
    expect(Object.keys(JSON.parse(kv.data.get('quiz:v1:memory:testkit:attempts')!))).toEqual(['a1'])
    expect(document.querySelector('.verdict')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Forget my result' })).toBeNull()
  })

  it('also clears exam history when asked', async () => {
    const u = userEvent.setup()
    const kv = memoryKv()
    kv.setItem('quiz:v1:memory:testkit:exams', JSON.stringify([{ id: 'e1', at: 0, percent: 50, earned: 1, possible: 2, seconds: 5, scores: [] }]))
    await renderQuiz(files(), shell(), { kv })
    const dialog = await openReset(u)
    await u.click(within(dialog).getByRole('button', { name: 'Reset progress…' }))
    await u.click(within(screen.getByRole('dialog', { name: 'Reset progress for this quiz?' })).getByRole('button', { name: 'Reset' }))
    expect(kv.data.get('quiz:v1:memory:testkit:exams')).toBeUndefined()
  })
})

describe('remembered filters', () => {
  it('a remembered filter that matches nothing says so and can be cleared in one click', async () => {
    const u = userEvent.setup()
    const kv = memoryKv()
    kv.setItem('quiz:v1:memory:testkit:ui', JSON.stringify({ filters: { query: 'zzz-nothing' } }))
    await renderQuiz(files(), shell(), { kv })
    expect(screen.getByRole('alert').textContent).toContain('No question matches your filters')
    expect(screen.getByText('no question matches the filter')).toBeTruthy()
    await u.click(within(screen.getByRole('alert')).getByRole('button', { name: 'Clear filters' }))
    expect(screen.queryByRole('alert')).toBeNull()
    expect(screen.getByText(/\d+ \/ 6/)).toBeTruthy()
  })
})

describe('chrome', () => {
  it('hides the Reference button when the quiz has none and shows the drawer when it has one', async () => {
    const none = await renderQuiz(files(), shell())
    expect(screen.queryByRole('button', { name: 'Reference' })).toBeNull()
    none.unmount()
    const u = userEvent.setup()
    await renderQuiz({ ...files({ reference: 'ref.md' }), 'ref.md': '# Guide\n\nSoftmax text\n\n## Other\n\nunrelated' }, shell())
    await u.click(screen.getByRole('button', { name: 'Reference' }))
    const drawer = screen.getByRole('dialog', { name: 'Reference' })
    expect(within(drawer).getByText('Softmax text')).toBeTruthy()
    await u.type(within(drawer).getByLabelText('Search the reference'), 'unrelated')
    expect(within(drawer).queryByText('Softmax text')).toBeNull()
    expect(within(drawer).getByText('unrelated')).toBeTruthy()
  })

  it('searches reference entries and opens one from a question chip', async () => {
    const u = userEvent.setup()
    const ref = { entries: [{ name: 'torch.sum', summary: 'Adds things', see_also: ['torch.mean'] }, { name: 'torch.mean', summary: 'Averages things', aliases: ['mean'] }] }
    const f = { 'manifest.json': manifest({ reference: 'ref.json' }), 'q.json': [mcq('a1', 'a', { reference: ['torch.mean'] })], 'ref.json': ref }
    await renderQuiz(f, shell())
    await u.click(screen.getByRole('button', { name: 'torch.mean' }))
    const drawer = screen.getByRole('dialog', { name: 'Reference' })
    expect(drawer.querySelector('.ref-entry.focus h3')!.textContent).toBe('torch.mean')
    await u.type(within(drawer).getByLabelText('Search the reference'), 'adds')
    expect(within(drawer).queryByText('Averages things')).toBeNull()
    expect(within(drawer).getByText('Adds things')).toBeTruthy()
  })

  it('copies a share link for GitHub sources and disables it for local folders', async () => {
    const u = userEvent.setup()
    const writeText = vi.fn(async () => {})
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    const gh = await renderQuiz(files(), shell(), { spec: { kind: 'github', owner: 'o', repo: 'r', ref: 'dev', path: 'c/m' } })
    await u.click(screen.getByRole('button', { name: 'Copy share link' }))
    expect(writeText).toHaveBeenCalledWith(expect.stringMatching(/\?repo=o\/r&path=c\/m&ref=dev$/))
    expect(await screen.findByText('Share link copied')).toBeTruthy()
    gh.unmount()
    await renderQuiz(files(), shell())
    expect((screen.getByRole('button', { name: 'Copy share link' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('shows authoring diagnostics for skipped questions', async () => {
    const f = { 'manifest.json': manifest(), 'q.json': [mcq('ok', 'a'), { ...mcq('bad', 'a'), explaination: 'x' }] }
    await renderQuiz(f, shell())
    expect(screen.getByText(/1 question skipped/)).toBeTruthy()
    expect(screen.getByText('unknown field "explaination"')).toBeTruthy()
    expect(screen.getByText('→ did you mean "explanation"?')).toBeTruthy()
  })

  it('shows the keyboard help', async () => {
    const u = userEvent.setup()
    await renderQuiz(files(), shell())
    await u.keyboard('?')
    expect(screen.getByRole('dialog', { name: 'Keyboard shortcuts' })).toBeTruthy()
  })
})

describe('exam mode', () => {
  const examFiles = (extra: object = {}) => ({
    'manifest.json': manifest(extra),
    'q.json': [...['a1', 'a2', 'a3', 'a4'].map((id) => mcq(id, 'a')), ...['b1', 'b2', 'b3', 'b4'].map((id) => mcq(id, 'b')), { type: 'short-answer', id: 'sa', topic: 'b', title: 'SA', prompt: 'p', modelAnswer: 'm', rubric: [{ text: 'r1' }] }],
  })
  const openBuilder = async (u: ReturnType<typeof userEvent.setup>) => u.click(screen.getByRole('tab', { name: 'Exam' }))

  it('builds an exam with topic weights and shows the resulting allocation', async () => {
    const u = userEvent.setup()
    await renderQuiz(examFiles(), shell())
    await openBuilder(u)
    await u.clear(screen.getByLabelText('Number of questions'))
    await u.type(screen.getByLabelText('Number of questions'), '4')
    await u.type(screen.getByLabelText('Weight for Alpha'), '75')
    const rows = Object.fromEntries(screen.getAllByRole('row').slice(1).map((r) => [within(r).getAllByRole('cell')[1].textContent, within(r).getAllByRole('cell')[4].textContent]))
    expect(rows).toEqual({ Alpha: '3', Beta: '1' })
    expect(screen.getByText(/Weights set: 75%, 25% left/)).toBeTruthy()
    await u.click(screen.getByLabelText('Include Beta'))
    expect(screen.getByRole('button', { name: /Start exam \(4 questions\)/ })).toBeTruthy()
    expect((screen.getByLabelText('Weight for Beta') as HTMLInputElement).disabled).toBe(true)
  })

  it('takes an exam: no feedback, navigator, flagging, confirm, score by topic and type, review', async () => {
    const u = userEvent.setup()
    await renderQuiz(examFiles(), shell())
    await openBuilder(u)
    await u.clear(screen.getByLabelText('Number of questions'))
    await u.type(screen.getByLabelText('Number of questions'), '4')
    await u.click(screen.getByRole('button', { name: /Start exam/ }))
    expect(window.location.hash).toBe('#/exam/run')
    expect(screen.queryByRole('button', { name: 'Check answer' })).toBeNull()
    expect(screen.queryByRole('button', { name: /Hint/ })).toBeNull()
    const nav = screen.getByRole('complementary', { name: 'Question navigator' })
    expect(within(nav).getAllByRole('button')).toHaveLength(4)

    // answer the first question correctly, flag the second, skip the rest
    const answer = async (text: RegExp) => u.click(screen.getByLabelText(text))
    const q1 = title()!
    await answer(/right /)
    expect(screen.queryByText('Correct!')).toBeNull()
    await u.click(within(nav).getByRole('button', { name: /Question 2/ }))
    await u.click(screen.getByRole('button', { name: /Flag/ }))
    expect(within(nav).getByRole('button', { name: /Question 2, flagged/ })).toBeTruthy()
    expect(within(nav).getByRole('button', { name: /Question 1, answered/ })).toBeTruthy()

    await u.click(screen.getByRole('button', { name: 'Submit exam' }))
    expect(within(screen.getByRole('dialog')).getByText(/unanswered/).textContent).toContain('3')
    await u.click(screen.getByRole('button', { name: 'Submit' }))

    expect(window.location.hash).toBe('#/exam/result')
    expect(screen.getByLabelText(/Score \d+ percent/).textContent).toMatch(/\d+%/)
    expect(screen.getByRole('region', { name: 'Score by topic' })).toBeTruthy()
    expect(screen.getByRole('region', { name: 'Score by question type' })).toBeTruthy()
    const review = screen.getByRole('region', { name: 'Review' })
    expect(within(review).getAllByText(/Title |SA/).length).toBeGreaterThan(0)
    await u.click(within(review).getByRole('button', { name: 'Flagged' }))
    expect(review.querySelectorAll('details')).toHaveLength(1)
    await u.click(within(review).getByRole('button', { name: 'Unanswered' }))
    expect(review.querySelectorAll('details').length).toBeGreaterThanOrEqual(3)
    void q1
  })

  it('gives everyone the same questions, order and shuffles for the same seed', async () => {
    const preset = { count: 5, seed: 424242 }
    const run = async () => {
      window.location.hash = ''
      const u = userEvent.setup()
      const r = await renderQuiz(examFiles(), shell(preset))
      await waitFor(() => expect(window.location.hash).toBe('#/exam'))
      await u.click(screen.getByRole('button', { name: /Start exam/ }))
      const seq: string[] = []
      for (let i = 0; i < 5; i++) {
        seq.push(title()!)
        if (i < 4) await u.click(screen.getByRole('button', { name: /Next/ }))
      }
      r.unmount()
      return seq
    }
    const a = await run()
    const b = await run()
    expect(a).toEqual(b)
    expect(new Set(a).size).toBe(5)
  })

  it('auto-submits when the timer runs out', async () => {
    // Testing Library only drains fake timers when it sees a `jest` global; Vitest has none, so provide the one method it calls.
    vi.stubGlobal('jest', { advanceTimersByTime: (ms: number) => vi.advanceTimersByTime(ms) })
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'setTimeout', 'clearTimeout', 'Date'] })
    const u = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    await renderQuiz(examFiles(), shell())
    // jsdom delivers hashchange from a (now fake) timer, so let it fire after each navigation.
    const settle = () => act(async () => void vi.advanceTimersByTime(20))
    await openBuilder(u)
    await settle()
    await u.clear(screen.getByLabelText('Timer in minutes'))
    await u.type(screen.getByLabelText('Timer in minutes'), '2')
    await u.click(screen.getByRole('button', { name: /Start exam/ }))
    await settle()
    expect(screen.getByRole('timer').textContent).toBe('02:00')
    await act(async () => void vi.advanceTimersByTime(61_000))
    expect(screen.getByRole('timer').textContent).toBe('00:59')
    expect(screen.getByRole('timer').className).toContain('low')
    expect(window.location.hash).toBe('#/exam/run')
    await act(async () => void vi.advanceTimersByTime(60_000))
    expect(window.location.hash).toBe('#/exam/result')
    expect(screen.getByLabelText(/^Score \d+ percent/)).toBeTruthy()
  })

  it('saves the result to the history and lets short answers be self-graded afterwards, updating the score', async () => {
    const u = userEvent.setup()
    const { kv } = await renderQuiz(examFiles(), shell())
    await openBuilder(u)
    await u.click(screen.getByRole('button', { name: 'Short answer' })) // toggles OFF short answers
    await u.click(screen.getByRole('button', { name: 'Short answer' })) // and back on
    await u.clear(screen.getByLabelText('Number of questions'))
    await u.type(screen.getByLabelText('Number of questions'), '9')
    await u.click(screen.getByRole('button', { name: /Start exam/ }))
    const nav = screen.getByRole('complementary', { name: 'Question navigator' })
    // find the short answer, type something
    for (let i = 1; i <= 9; i++) {
      await u.click(within(nav).getByRole('button', { name: new RegExp(`Question ${i}(,|$)`) }))
      if (title() === 'SA') {
        await u.type(screen.getByLabelText('Your answer'), 'something')
        break
      }
    }
    await u.click(screen.getByRole('button', { name: 'Submit exam' }))
    await u.click(screen.getByRole('button', { name: 'Submit' }))
    expect(screen.getByText(/short answer\(s\) waiting for your self-grade/)).toBeTruthy()
    const before = JSON.parse(kv.data.get('quiz:v1:memory:testkit:exams')!)
    expect(before).toHaveLength(1)
    expect(before[0].pending).toBe(1)
    await u.click(screen.getByLabelText('r1'))
    await u.click(screen.getByRole('button', { name: 'Save my grade' }))
    await waitFor(() => expect(JSON.parse(kv.data.get('quiz:v1:memory:testkit:exams')!)[0].pending).toBe(0))
    expect(JSON.parse(kv.data.get('quiz:v1:memory:testkit:exams')!)[0].possible).toBe(9)
  })

  it('asks before leaving a running exam', async () => {
    const u = userEvent.setup()
    const onHome = vi.fn()
    await renderQuiz(examFiles(), <QuizShell onHome={onHome} />)
    await openBuilder(u)
    await u.click(screen.getByRole('button', { name: /Start exam/ }))
    await u.click(screen.getByRole('button', { name: 'Back to start' }))
    expect(onHome).not.toHaveBeenCalled()
    await u.click(screen.getByRole('button', { name: 'Stay' }))
    await u.click(screen.getByRole('button', { name: 'Back to start' }))
    await u.click(screen.getByRole('button', { name: /Leave and lose/ }))
    expect(onHome).toHaveBeenCalled()
  })

  it('builds links with a preset and opens the builder from one', async () => {
    const u = userEvent.setup()
    const writeText = vi.fn(async () => {})
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    await renderQuiz(examFiles(), shell({ count: 3, minutes: 7, weights: { a: 60 } }), { spec: { kind: 'github', owner: 'o', repo: 'r', ref: 'main', path: '' } })
    await waitFor(() => expect(screen.getByText(/Exam setup loaded from a shared link/)).toBeTruthy())
    expect((screen.getByLabelText('Number of questions') as HTMLInputElement).value).toBe('3')
    expect((screen.getByLabelText('Timer in minutes') as HTMLInputElement).value).toBe('7')
    expect((screen.getByLabelText('Weight for Alpha') as HTMLInputElement).value).toBe('60')
    await u.click(within(screen.getByRole('main')).getByRole('button', { name: 'Copy share link' }))
    const url = String((writeText.mock.calls[0] as unknown[])[0])
    expect(url).toContain('?repo=o/r&preset=')
    const { decodePreset } = await import('../core/share/preset.ts')
    expect(decodePreset(url.split('preset=')[1]).preset).toMatchObject({ count: 3, minutes: 7, weights: { a: 60 } })
    expect(decodePreset(url.split('preset=')[1]).preset).not.toHaveProperty('seed')
  })
})
