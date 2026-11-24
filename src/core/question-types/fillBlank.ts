import type { Blank, Distractor, FillBlankQuestion } from '../model/types.ts'
import { makeRng, pick, shuffled } from '../random.ts'
import { collapse, compilePattern, matchesAny, type MatchOptions } from '../text/normalize.ts'
import { err, result, warn, type CheckIssue, type TypeModule } from './api.ts'

export const BLANK_MARKER = /<<BLANK:([A-Za-z0-9_.:-]+)>>/g

export interface ChoiceView {
  text: string
  correct: boolean
  why?: string
}
export interface BankChip {
  id: string
  text: string
}
export interface FillBlankInstance {
  type: 'fill-blank'
  seed: number
  question: FillBlankQuestion
  /** choice-mode blanks: the options to show. */
  choices: Record<string, ChoiceView[]>
  /** drag mode: the shared, shuffled chip bank. */
  bank: BankChip[]
}
export type FillBlankAnswer = { type: 'fill-blank'; values: Record<string, string> }

export type BlankMode = 'text' | 'choice' | 'drag'
export const blankMode = (q: FillBlankQuestion, b: Blank): BlankMode => (q.mode === 'drag' ? 'drag' : (b.mode ?? q.mode ?? 'text'))
const matchOpts = (q: FillBlankQuestion, b: Blank): MatchOptions => ({ kind: q.language ? 'code' : 'prose', caseSensitive: b.caseSensitive })
const dText = (d: Distractor) => (typeof d === 'string' ? d : d.text)
const dWhy = (d: Distractor) => (typeof d === 'string' ? undefined : d.why)
const key = (s: string) => collapse(s).toLowerCase()

/** Distractors that are not (equivalent to) an accepted answer, de-duplicated. */
function usableDistractors(q: FillBlankQuestion, ds: readonly Distractor[], blanks: readonly Blank[]): Distractor[] {
  const seen = new Set<string>()
  return ds.filter((d) => {
    if (blanks.some((b) => matchesAny(dText(d), b.answers, b.patterns, matchOpts(q, b)))) return false
    const k = key(dText(d))
    if (seen.has(k)) return false
    seen.add(k)
    return true
  })
}

function instantiate(q: FillBlankQuestion, seed: number): FillBlankInstance {
  const rng = makeRng(seed)
  const choices: Record<string, ChoiceView[]> = {}
  for (const b of q.blanks) {
    if (blankMode(q, b) !== 'choice') continue
    if (b.options) {
      choices[b.id] = b.options.map((text) => ({ text, correct: matchesAny(text, b.answers, b.patterns, matchOpts(q, b)) }))
    } else {
      const wrong = shuffled(usableDistractors(q, b.distractors ?? [], [b]), rng).slice(0, Math.max(2, b.show ?? 4) - 1)
      choices[b.id] = shuffled(
        [
          { text: pick(b.answers, rng), correct: true } as ChoiceView,
          ...wrong.map((d) => ({ text: dText(d), correct: false, ...(dWhy(d) && { why: dWhy(d) }) })),
        ],
        rng,
      )
    }
  }
  let bank: BankChip[] = []
  if (q.mode === 'drag') {
    const chips: BankChip[] = q.blanks.map((b) => ({ id: `blank:${b.id}`, text: pick(b.answers, rng) }))
    const extra = usableDistractors(q, q.distractors ?? [], q.blanks).map((d, i) => ({ id: `distractor:${i}`, text: dText(d) }))
    bank = shuffled([...chips, ...extra], rng)
  }
  return { type: 'fill-blank', seed, question: q, choices, bank }
}

function grade(inst: FillBlankInstance, ans: FillBlankAnswer) {
  const q = inst.question
  const blanks: Record<string, boolean> = {}
  for (const b of q.blanks) blanks[b.id] = matchesAny(ans.values[b.id] ?? '', b.answers, b.patterns, matchOpts(q, b))
  const n = q.blanks.length
  return result(Object.values(blanks).filter(Boolean).length / n, { blanks })
}

function check(q: FillBlankQuestion): CheckIssue[] {
  const out: CheckIssue[] = []
  const ids = new Map<string, number>()
  q.blanks.forEach((b, i) => {
    if (ids.has(b.id)) out.push(err(`/blanks/${i}/id`, `duplicate blank id "${b.id}"`))
    ids.set(b.id, i)
  })
  const used = new Map<string, number>()
  for (const m of q.template.matchAll(BLANK_MARKER)) used.set(m[1], (used.get(m[1]) ?? 0) + 1)
  for (const [id, n] of used) {
    if (!ids.has(id)) out.push(err('/template', `marker <<BLANK:${id}>> has no entry in "blanks"`, `add a blank with "id": "${id}"`))
    else if (n > 1) out.push(err('/template', `marker <<BLANK:${id}>> appears ${n} times`, 'use one marker per blank'))
  }
  q.blanks.forEach((b, i) => {
    if (!used.has(b.id)) out.push(err(`/blanks/${i}`, `blank "${b.id}" has no <<BLANK:${b.id}>> marker in the template`))
    b.patterns?.forEach((p, j) => {
      if (!compilePattern(p)) out.push(err(`/blanks/${i}/patterns/${j}`, `invalid regular expression ${JSON.stringify(p)}`, 'patterns are anchored and max 300 characters'))
    })
    if (q.mode === 'drag' && b.mode) out.push(err(`/blanks/${i}/mode`, 'drag mode applies to the whole question', 'remove the per-blank "mode"'))
    if (blankMode(q, b) === 'choice') {
      if (!b.options && !b.distractors) out.push(err(`/blanks/${i}`, `choice blank "${b.id}" needs "options" or "distractors"`))
      if (b.options && !b.options.some((o) => matchesAny(o, b.answers, b.patterns, matchOpts(q, b))))
        out.push(err(`/blanks/${i}/options`, `none of the options matches an accepted answer of blank "${b.id}"`))
      if (b.options && b.distractors) out.push(warn(`/blanks/${i}/distractors`, '"distractors" is ignored when "options" is given'))
    }
  })
  if (q.mode !== 'drag' && q.distractors) out.push(warn('/distractors', '"distractors" is only used in drag mode'))
  return out
}

export const fillBlank: TypeModule<FillBlankQuestion, FillBlankInstance, FillBlankAnswer> = {
  instantiate,
  grade,
  check,
  emptyAnswer: () => ({ type: 'fill-blank', values: {} }),
}
