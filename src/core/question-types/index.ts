import type { Answer, GradeResult, Question, QuestionType } from '../model/types.ts'
import type { CheckIssue } from './api.ts'
import { calculation, type CalculationInstance } from './calculation.ts'
import { categorize, type CategorizeInstance } from './categorize.ts'
import { codeDebug, type CodeDebugInstance } from './codeDebug.ts'
import { mcq, multiSelect, type McqInstance, type MultiSelectInstance } from './choice.ts'
import { fillBlank, type FillBlankInstance } from './fillBlank.ts'
import { matching, type MatchingInstance } from './matching.ts'
import { ordering, type OrderingInstance } from './ordering.ts'
import { shortAnswer, type ShortAnswerInstance } from './shortAnswer.ts'

export type Instance =
  | FillBlankInstance
  | CodeDebugInstance
  | McqInstance
  | MultiSelectInstance
  | CalculationInstance
  | OrderingInstance
  | MatchingInstance
  | CategorizeInstance
  | ShortAnswerInstance

type Loose = {
  instantiate(q: never, seed: number): Instance
  grade(i: never, a: never): GradeResult
  check(q: never): CheckIssue[]
  emptyAnswer(i: never): Answer
}

const registry: Record<QuestionType, Loose> = {
  'fill-blank': fillBlank,
  'code-debug': codeDebug,
  mcq,
  'multi-select': multiSelect,
  calculation,
  ordering,
  matching,
  categorize,
  'short-answer': shortAnswer,
}

/** One concrete showing of `q`. Same (q, seed) always gives the same instance. */
export function instantiate(q: Question, seed: number): Instance {
  return registry[q.type].instantiate(q as never, seed)
}

export function grade(inst: Instance, answer: Answer): GradeResult {
  if (answer.type !== inst.type) throw new Error(`answer type "${answer.type}" does not match question type "${inst.type}"`)
  return registry[inst.type].grade(inst as never, answer as never)
}

export function emptyAnswer(inst: Instance): Answer {
  return registry[inst.type].emptyAnswer(inst as never)
}

/** Semantic problems the JSON Schema cannot express. */
export function checkQuestion(q: Question): CheckIssue[] {
  return registry[q.type].check(q as never)
}

export type { CheckIssue } from './api.ts'
export type { BankChip, ChoiceView, FillBlankInstance } from './fillBlank.ts'
export { blankMode, BLANK_MARKER } from './fillBlank.ts'
export type { CalculationInstance, ResolvedCalcQuestion } from './calculation.ts'
