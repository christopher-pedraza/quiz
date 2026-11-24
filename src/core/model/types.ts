export type Difficulty = 'easy' | 'medium' | 'hard'

export interface Diagnostic {
  severity: 'error' | 'warning'
  file?: string
  /** 1-based line, for .jsonl files. */
  line?: number
  /** 0-based position in the file's question array. */
  index?: number
  id?: string
  /** JSON pointer inside the question / manifest. */
  path?: string
  message: string
  hint?: string
}

export interface TopicDef {
  id: string
  title: string
  description?: string
}

export interface ManifestInput {
  schemaVersion?: number
  title: string
  description: string
  author?: string
  version?: string
  topics: (string | TopicDef)[]
  questions: string[]
  reference?: string
  theme?: string | ThemeInput
  exam?: { count?: number; minutes?: number }
}

export interface Manifest extends Omit<ManifestInput, 'topics'> {
  topics: TopicDef[]
}

export interface ThemeInput {
  scheme?: 'dark' | 'light'
  accent?: string
  accentSecondary?: string
  bgPrimary?: string
  bgSurface?: string
  fontSans?: string
  fontMono?: string
  radius?: string
}

/** A distractor is either plain text or text plus the reason it is wrong. */
export type Distractor = string | { text: string; why?: string }

export interface QuestionBase {
  id: string
  topic: string
  title?: string
  difficulty?: Difficulty
  tags?: string[]
  prompt?: string
  hints?: string[]
  explanation?: string
  points?: number
  reference?: string[]
}

export interface Blank {
  id: string
  answers: string[]
  patterns?: string[]
  label?: string
  placeholder?: string
  multiline?: boolean
  caseSensitive?: boolean
  mode?: 'text' | 'choice'
  /** choice mode, static list. */
  options?: string[]
  /** choice mode, sampled: one accepted answer + (show-1) of these. */
  distractors?: Distractor[]
  show?: number
}

export interface FillBlankQuestion extends QuestionBase {
  type: 'fill-blank'
  template: string
  language?: string
  mode?: 'text' | 'choice' | 'drag'
  blanks: Blank[]
  /** drag mode: extra chips that belong to no blank. */
  distractors?: Distractor[]
}

export interface CodeError {
  line: number
  fixes: string[]
  options?: string[]
  explanation?: string
}

export interface CodeDebugQuestion extends QuestionBase {
  type: 'code-debug'
  language?: string
  code: string
  errors: CodeError[]
}

export interface ChoiceOption {
  text: string
  correct: boolean
  explanation?: string
}

export interface McqQuestion extends QuestionBase {
  type: 'mcq'
  options: ChoiceOption[]
  shuffle?: boolean
}

export interface MultiSelectQuestion extends QuestionBase {
  type: 'multi-select'
  options: ChoiceOption[]
  grading?: 'all-or-nothing' | 'partial'
  shuffle?: boolean
}

export type Tolerance = number | { abs?: number; rel?: number }

export interface CalcPart {
  id: string
  label?: string
  value?: number
  formula?: string
  tolerance?: Tolerance
  unit?: string
}

export type VariableSpec = { choices: number[] } | { min: number; max: number; step?: number } | { formula: string }

export interface CalculationQuestion extends QuestionBase {
  type: 'calculation'
  code?: string
  language?: string
  parts: CalcPart[]
  variables?: Record<string, VariableSpec>
  constraints?: string[]
}

export interface OrderingQuestion extends QuestionBase {
  type: 'ordering'
  items: string[]
  language?: string
  grading?: 'exact' | 'partial'
}

export interface MatchingQuestion extends QuestionBase {
  type: 'matching'
  pairs: { left: string; right: string }[]
  distractors?: string[]
  grading?: 'all-or-nothing' | 'partial'
}

export interface CategorizeQuestion extends QuestionBase {
  type: 'categorize'
  categories: { id: string; title: string; items: string[] }[]
  distractors?: string[]
  distractorPenalty?: number
}

export interface ShortAnswerQuestion extends QuestionBase {
  type: 'short-answer'
  modelAnswer: string
  rubric: { text: string; points?: number }[]
}

export type Question =
  | FillBlankQuestion
  | CodeDebugQuestion
  | McqQuestion
  | MultiSelectQuestion
  | CalculationQuestion
  | OrderingQuestion
  | MatchingQuestion
  | CategorizeQuestion
  | ShortAnswerQuestion

export type QuestionType = Question['type']

export const QUESTION_TYPES: readonly { type: QuestionType; label: string }[] = [
  { type: 'fill-blank', label: 'Fill in the blanks' },
  { type: 'code-debug', label: 'Find & fix the bug' },
  { type: 'mcq', label: 'Multiple choice' },
  { type: 'multi-select', label: 'Select all that apply' },
  { type: 'calculation', label: 'Calculation' },
  { type: 'ordering', label: 'Ordering' },
  { type: 'matching', label: 'Matching' },
  { type: 'categorize', label: 'Categorize' },
  { type: 'short-answer', label: 'Short answer' },
]

export interface ReferenceEntry {
  name: string
  aliases?: string[]
  kind?: string
  module?: string
  signature?: string
  summary: string
  parameters?: { name: string; type?: string; default?: string; description: string }[]
  returns?: string
  example?: string
  notes?: string[]
  see_also?: string[]
  tags?: string[]
}

export type Reference = { kind: 'markdown'; text: string } | { kind: 'entries'; entries: ReferenceEntry[] }

/** Learner answers, one shape per question type. */
export type Answer =
  | { type: 'fill-blank'; values: Record<string, string> }
  | { type: 'code-debug'; marked: number[]; fixes: Record<number, string> }
  | { type: 'mcq'; picked: number | null }
  | { type: 'multi-select'; picked: number[] }
  | { type: 'calculation'; values: Record<string, string> }
  /** `order` lists ORIGINAL item indexes in the learner's order. */
  | { type: 'ordering'; order: number[] }
  /** One entry per pair (by pair index): the chosen right-hand text or null. */
  | { type: 'matching'; chosen: (string | null)[] }
  /** chip text -> category id, or null / absent when still in the pool. */
  | { type: 'categorize'; placed: Record<string, string | null> }
  /** `selfGraded` flips to true once the learner has ticked the rubric (even if nothing was ticked). */
  | { type: 'short-answer'; text: string; checked: number[]; selfGraded: boolean }

export interface GradeResult {
  /** 0..1. For short-answer, 0 until self-graded. */
  score: number
  /** score === 1 */
  correct: boolean
  /** false when the question still needs the learner to self-grade. */
  graded: boolean
  /** Per-item verdicts (blank id, part id, line, …) for the feedback UI. */
  detail: Record<string, unknown>
}
