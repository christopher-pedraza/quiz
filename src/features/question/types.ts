import type { GradeResult } from '../../core/model/types.ts'

/** What every per-type renderer receives. `result` present = show feedback; `locked` = read-only. */
export interface ViewProps<I, A> {
  inst: I
  answer: A
  onChange(answer: A): void
  locked: boolean
  result?: GradeResult
}
