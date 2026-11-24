// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it } from 'vitest'
import type { Answer, GradeResult, Question } from '../../core/model/types.ts'
import { emptyAnswer, grade, instantiate } from '../../core/question-types/index.ts'
import { QuestionCard } from './QuestionCard.tsx'

/** Renders a question the way Practice does and lets tests drive it; `check()` grades like the Check button. */
function Harness({ q, seed = 1, onState }: { q: Question; seed?: number; onState?: (s: { answer: Answer; result?: GradeResult }) => void }) {
  const inst = instantiate(q, seed)
  const [answer, setAnswer] = useState<Answer>(() => emptyAnswer(inst))
  const [result, setResult] = useState<GradeResult>()
  onState?.({ answer, result })
  return <QuestionCard inst={inst} answer={answer} onAnswer={setAnswer} mode="practice" result={result} topicTitle="T" flagged={false} onFlag={() => {}} onCheck={() => setResult(grade(inst, answer))} onRetry={() => (setAnswer(emptyAnswer(inst)), setResult(undefined))} />
}
const base = { id: 'q', topic: 't' }
const check = (u: ReturnType<typeof userEvent.setup>) => u.click(screen.getByRole('button', { name: 'Check answer' }))
// dnd-kit adds its own role=status live region, so the verdict is found by class.
const verdict = () => document.querySelector('.verdict')!.textContent

describe('fill-blank', () => {
  const text: Question = { ...base, type: 'fill-blank', language: 'python', template: 'x = <<BLANK:a>>\ny = <<BLANK:b>>', blanks: [{ id: 'a', answers: ['1'] }, { id: 'b', answers: ['2'] }] }
  it('text mode: type, check, see per-blank verdicts and the right answer', async () => {
    const u = userEvent.setup()
    render(<Harness q={text} />)
    await u.type(screen.getByLabelText('Blank a'), '1')
    await u.type(screen.getByLabelText('Blank b'), '9')
    await check(u)
    expect(verdict()).toContain('Partly correct: 50%')
    expect(screen.getByLabelText('Blank a').className).toContain('ok')
    expect(screen.getByLabelText('Blank b').className).toContain('bad')
    expect(screen.getByText('→ 2')).toBeTruthy()
    expect((screen.getByLabelText('Blank a') as HTMLInputElement).disabled).toBe(true)
  })
  it('choice mode renders a dropdown', async () => {
    const q: Question = { ...base, type: 'fill-blank', mode: 'choice', template: 'It is <<BLANK:a>>.', blanks: [{ id: 'a', answers: ['two'], options: ['one', 'two'] }] }
    const u = userEvent.setup()
    render(<Harness q={q} />)
    await u.selectOptions(screen.getByLabelText('Blank a'), 'two')
    await check(u)
    expect(verdict()).toContain('Correct')
  })
  const drag: Question = { ...base, type: 'fill-blank', mode: 'drag', template: 'A <<BLANK:a>> then <<BLANK:b>>.', blanks: [{ id: 'a', answers: ['first'] }, { id: 'b', answers: ['second'] }], distractors: ['third'] }
  it('drag mode, prose: click a chip, then click a blank (no dragging needed)', async () => {
    const u = userEvent.setup()
    render(<Harness q={drag} />)
    const bank = screen.getByRole('group', { name: 'Word bank' })
    expect(within(bank).getAllByRole('button')).toHaveLength(3)
    await u.click(within(bank).getByRole('button', { name: 'first' }))
    expect(within(bank).getByRole('button', { name: 'first' }).getAttribute('aria-pressed')).toBe('true')
    await u.click(screen.getByRole('group', { name: 'Blank a' }))
    expect(within(screen.getByRole('group', { name: 'Blank a' })).getByRole('button', { name: 'first' })).toBeTruthy()
    expect(within(bank).queryByRole('button', { name: 'first' })).toBeNull()
  })
  it('drag mode: keyboard only (Enter selects a chip, Enter on a blank places it), swap and return to bank', async () => {
    const u = userEvent.setup()
    render(<Harness q={drag} />)
    const chip = (n: string) => within(screen.getByRole('group', { name: 'Word bank' })).getByRole('button', { name: n })
    chip('second').focus()
    await u.keyboard('{Enter}')
    screen.getByRole('group', { name: 'Blank a' }).focus()
    await u.keyboard('{Enter}')
    const slotA = screen.getByRole('group', { name: 'Blank a' })
    expect(within(slotA).getByRole('button', { name: 'second' })).toBeTruthy()
    // placing another chip in the same blank sends the old one back to the bank
    await u.click(chip('third'))
    await u.click(slotA)
    expect(within(slotA).queryByRole('button', { name: 'second' })).toBeNull()
    expect(within(slotA).getByRole('button', { name: 'third' })).toBeTruthy()
    expect(chip('second')).toBeTruthy()
    // click the placed chip, then the bank: back to the bank
    await u.click(within(slotA).getByRole('button', { name: 'third' }))
    await u.click(screen.getByRole('group', { name: 'Word bank' }))
    expect(within(slotA).queryByRole('button')).toBeNull()
  })
  it('drag mode: grading and read-only after check', async () => {
    const u = userEvent.setup()
    render(<Harness q={drag} />)
    const bank = () => screen.getByRole('group', { name: 'Word bank' })
    await u.click(within(bank()).getByRole('button', { name: 'first' }))
    await u.click(screen.getByRole('group', { name: 'Blank a' }))
    await u.click(within(bank()).getByRole('button', { name: 'third' }))
    await u.click(screen.getByRole('group', { name: 'Blank b' }))
    await check(u)
    expect(verdict()).toContain('50%')
    expect(screen.getByText('→ second')).toBeTruthy()
    expect((within(screen.getByRole('group', { name: 'Blank a' })).getByRole('button') as HTMLButtonElement).disabled).toBe(true)
  })
  it('drag mode, code: chips go into a code listing', async () => {
    const q: Question = { ...base, type: 'fill-blank', mode: 'drag', language: 'python', template: 'z = x.<<BLANK:m>>()', blanks: [{ id: 'm', answers: ['mean'] }], distractors: ['sum'] }
    const u = userEvent.setup()
    render(<Harness q={q} />)
    await u.click(within(screen.getByRole('group', { name: 'Word bank' })).getByRole('button', { name: 'mean' }))
    await u.click(screen.getByRole('group', { name: 'Blank m' }))
    await check(u)
    expect(verdict()).toContain('Correct')
  })
})

describe('mcq / multi-select', () => {
  const options = [{ text: 'alpha', correct: false, explanation: 'no alpha' }, { text: 'beta', correct: true, explanation: 'yes beta' }, { text: 'gamma', correct: true }]
  it('mcq: number keys pick the n-th option; feedback marks picks and explains every option', async () => {
    const u = userEvent.setup()
    render(<Harness q={{ ...base, type: 'mcq', prompt: 'p', options: options.slice(0, 2) }} />)
    await u.keyboard('1')
    expect((screen.getByLabelText(/^alpha/) as HTMLInputElement).checked).toBe(true)
    await u.keyboard('2')
    expect((screen.getByLabelText(/^beta/) as HTMLInputElement).checked).toBe(true)
    expect((screen.getByLabelText(/^alpha/) as HTMLInputElement).checked).toBe(false)
    await u.click(screen.getByLabelText(/^alpha/))
    await check(u)
    expect(verdict()).toBe('Not quite.')
    expect(screen.getByLabelText(/^alpha/).closest('label')!.className).toContain('bad')
    expect(screen.getByLabelText(/^beta/).closest('label')!.className).toContain('missed')
    expect(screen.getByText(/yes beta/)).toBeTruthy()
    expect((screen.getByLabelText(/^beta/) as HTMLInputElement).disabled).toBe(true)
  })
  it('mcq with shuffle shows options in the instance order but grades the original option', async () => {
    const q: Question = { ...base, type: 'mcq', prompt: 'p', shuffle: true, options: [{ text: 'o0', correct: true }, { text: 'o1', correct: false }, { text: 'o2', correct: false }, { text: 'o3', correct: false }] }
    const order = (instantiate(q, 7) as { order: number[] }).order
    const u = userEvent.setup()
    render(<Harness q={q} seed={7} />)
    expect(screen.getAllByRole('radio').map((r) => r.closest('label')!.textContent!.replace(/\d$/, ''))).toEqual(order.map((i) => `o${i}`))
    await u.click(screen.getByLabelText(/^o0/))
    await check(u)
    expect(verdict()).toBe('Correct!')
  })
  it('multi-select: partial credit', async () => {
    const u = userEvent.setup()
    render(<Harness q={{ ...base, type: 'multi-select', prompt: 'p', grading: 'partial', options }} />)
    await u.click(screen.getByLabelText(/^beta/))
    await check(u)
    expect(verdict()).toBe('Partly correct: 50%')
  })
})

describe('calculation', () => {
  it('shows the tolerance, accepts expressions, and states the expected value when wrong', async () => {
    const q: Question = { ...base, type: 'calculation', prompt: 'p', parts: [{ id: 'a', label: 'speed-up', value: 3.676, tolerance: { rel: 0.02 }, unit: '×' }, { id: 'b', label: 'count', value: 2598 }] }
    const u = userEvent.setup()
    render(<Harness q={q} />)
    expect(screen.getByText('(±2% accepted)')).toBeTruthy()
    await u.type(screen.getByLabelText('speed-up'), '125/34')
    await u.type(screen.getByLabelText('count'), '2599')
    await check(u)
    expect(screen.getByText('expected 2,598')).toBeTruthy()
    expect(screen.getByLabelText('speed-up').className).toContain('ok')
    expect(verdict()).toBe('Partly correct: 50%')
  })
})

describe('ordering', () => {
  const q: Question = { ...base, type: 'ordering', prompt: 'p', items: ['one', 'two', 'three'] }
  const order = () => screen.getAllByRole('listitem').map((li) => li.querySelector('.txt')!.textContent)
  it('the up/down buttons reorder, the end buttons are disabled, and a correct order is graded correct', async () => {
    const u = userEvent.setup()
    render(<Harness q={q} seed={3} />)
    expect((screen.getAllByRole('button', { name: /Move .* up/ })[0] as HTMLButtonElement).disabled).toBe(true)
    // bubble-sort the list into place using only the buttons
    for (let guard = 0; guard < 10 && order().join() !== 'one,two,three'; guard++) {
      const now = order()
      const i = now.findIndex((t, k) => k < now.length - 1 && ['one', 'two', 'three'].indexOf(t!) > ['one', 'two', 'three'].indexOf(now[k + 1]!))
      await u.click(screen.getByRole('button', { name: `Move "${now[i + 1]}" up` }))
    }
    expect(order()).toEqual(['one', 'two', 'three'])
    await check(u)
    expect(verdict()).toBe('Correct!')
  })
  it('wrong order: marks items and reveals the correct order', async () => {
    const u = userEvent.setup()
    render(<Harness q={q} seed={3} />)
    await check(u)
    expect(verdict()).toBe('Not quite.')
    expect(screen.getByText('Correct order')).toBeTruthy()
    expect(screen.getAllByRole('button', { name: /Move/ }).every((b) => (b as HTMLButtonElement).disabled)).toBe(true)
  })
  it('code (Parsons) items keep their indentation', () => {
    render(<Harness q={{ ...q, language: 'python', items: ['for x in y:', '    print(x)'] } as Question} />)
    expect([...document.querySelectorAll('.txt.code')].map((n) => n.textContent).sort()).toEqual(['    print(x)', 'for x in y:'])
  })
})

describe('matching', () => {
  const q: Question = { ...base, type: 'matching', prompt: 'p', pairs: [{ left: 'merge', right: 'O(n log n)' }, { left: 'heap', right: 'O(n log n)' }, { left: 'bubble', right: 'O(n^2)' }], distractors: ['O(1)'] }
  it('the same choice can be used for several rows; wrong rows show the right answer', async () => {
    const u = userEvent.setup()
    render(<Harness q={q} />)
    await u.selectOptions(screen.getByLabelText('Match for merge'), 'O(n log n)')
    await u.selectOptions(screen.getByLabelText('Match for heap'), 'O(n log n)')
    await u.selectOptions(screen.getByLabelText('Match for bubble'), 'O(1)')
    expect(within(screen.getByLabelText('Match for merge')).getAllByRole('option').map((o) => o.textContent).sort()).toEqual(['O(1)', 'O(n log n)', 'O(n^2)', '— choose —'])
    await check(u)
    expect(verdict()).toBe('Partly correct: 67%')
    expect(screen.getByText('→ O(n^2)')).toBeTruthy()
  })
})

describe('categorize', () => {
  const q: Question = {
    ...base, type: 'categorize', prompt: 'p', distractors: ['Banana'], distractorPenalty: 1,
    categories: [{ id: 'f', title: 'Fruit', items: ['Apple'] }, { id: 'v', title: 'Veg', items: ['Kale'] }],
  }
  const pool = () => screen.getByRole('group', { name: 'Chips to place' })
  it('click a chip, click a category; click the chip and the pool to take it back', async () => {
    const u = userEvent.setup()
    render(<Harness q={q} />)
    await u.click(within(pool()).getByRole('button', { name: 'Apple' }))
    await u.click(screen.getByRole('group', { name: 'Category: Fruit' }))
    expect(within(screen.getByRole('group', { name: 'Category: Fruit' })).getByRole('button', { name: 'Apple' })).toBeTruthy()
    expect(within(pool()).queryByRole('button', { name: 'Apple' })).toBeNull()
    await u.click(within(screen.getByRole('group', { name: 'Category: Fruit' })).getByRole('button', { name: 'Apple' }))
    await u.click(pool())
    expect(within(pool()).getByRole('button', { name: 'Apple' })).toBeTruthy()
  })
  it('keyboard-only placement works, and grading uses the distractor penalty', async () => {
    const u = userEvent.setup()
    render(<Harness q={q} />)
    const place = async (chip: string, cat: string) => {
      const el = screen.getAllByRole('button', { name: chip }).find((b) => b.classList.contains('dnd-chip'))!
      el.focus()
      await u.keyboard('{Enter}')
      screen.getByRole('group', { name: `Category: ${cat}` }).focus()
      await u.keyboard('{Enter}')
    }
    await place('Apple', 'Fruit')
    await place('Kale', 'Veg')
    await place('Banana', 'Veg')
    await check(u)
    expect(verdict()).toBe('Partly correct: 50%') // 2 right, penalty 1 for the distractor, out of 2 items: (2-1)/2
    expect(screen.getByText('not in any category')).toBeTruthy()
  })
})

describe('code-debug', () => {
  const q: Question = {
    ...base, type: 'code-debug', prompt: 'p', language: 'python', code: 'a = 1\nb = a +\nc = 3',
    errors: [{ line: 2, fixes: ['b = a + 1'], explanation: 'missing operand' }],
  }
  it('flag a line, type the fix, see per-line verdicts and the explanations', async () => {
    const u = userEvent.setup()
    render(<Harness q={q} />)
    await u.click(screen.getByRole('button', { name: 'Line 2' }))
    await u.type(screen.getByLabelText('Fix for line 2'), 'b=a+1')
    await u.click(screen.getByRole('button', { name: 'Line 3' }))
    await check(u)
    expect(verdict()).toBe('Not quite.') // one right, one false flag: 0 points
    expect(screen.getByText('no bug on this line')).toBeTruthy()
    expect(screen.getByText('correct')).toBeTruthy()
    expect(screen.getByText(/missing operand/)).toBeTruthy()
  })
  it('when every bug has options, flagged lines get one shared dropdown that does not reveal the bug line', async () => {
    const withOptions = { ...q, errors: [{ line: 2, fixes: ['b = a + 1'], options: ['b = a + 1', 'b = a + 2'] }] } as Question
    const u = userEvent.setup()
    render(<Harness q={withOptions} />)
    await u.click(screen.getByRole('button', { name: 'Line 1' }))
    expect(within(screen.getByLabelText('Fix for line 1')).getAllByRole('option').map((o) => o.textContent)).toContain('b = a + 1')
    await u.click(screen.getByRole('button', { name: 'Line 2' }))
    await u.selectOptions(screen.getByLabelText('Fix for line 2'), 'b = a + 1')
    await u.click(screen.getByRole('button', { name: 'Line 1' })) // unflag the decoy
    await check(u)
    expect(verdict()).toBe('Correct!')
  })
})
