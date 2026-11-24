import type { CodeDebugQuestion } from '../model/types.ts'
import { matchesAny } from '../text/normalize.ts'
import { err, result, warn, type CheckIssue, type TypeModule } from './api.ts'

export interface CodeDebugInstance {
  type: 'code-debug'
  seed: number
  question: CodeDebugQuestion
}
export type CodeDebugAnswer = { type: 'code-debug'; marked: number[]; fixes: Record<number, string> }
export type LineVerdict = 'correct' | 'wrong-fix' | 'not-an-error'

function grade(inst: CodeDebugInstance, ans: CodeDebugAnswer) {
  const q = inst.question
  const marked = new Set(ans.marked)
  const byLine = new Map(q.errors.map((e) => [e.line, e]))
  const verdicts: Record<number, LineVerdict> = {}
  let right = 0
  let falseFlags = 0
  for (const line of marked) {
    const e = byLine.get(line)
    if (!e) {
      verdicts[line] = 'not-an-error'
      falseFlags++
    } else if (matchesAny(ans.fixes[line] ?? '', e.fixes, [], { kind: 'code' })) {
      verdicts[line] = 'correct'
      right++
    } else verdicts[line] = 'wrong-fix'
  }
  const missed = q.errors.filter((e) => !marked.has(e.line)).map((e) => e.line)
  return result((right - falseFlags) / q.errors.length, { verdicts, missed })
}

function check(q: CodeDebugQuestion): CheckIssue[] {
  const out: CheckIssue[] = []
  const lines = q.code.split('\n').length
  const seen = new Set<number>()
  q.errors.forEach((e, i) => {
    if (e.line > lines) out.push(err(`/errors/${i}/line`, `line ${e.line} is outside the code (${lines} lines)`))
    if (seen.has(e.line)) out.push(err(`/errors/${i}/line`, `line ${e.line} is listed twice`, 'merge the accepted fixes into one error'))
    seen.add(e.line)
    if (e.options && !e.options.some((o) => matchesAny(o, e.fixes)))
      out.push(err(`/errors/${i}/options`, 'none of the options matches an accepted fix'))
  })
  const withOptions = q.errors.filter((e) => e.options).length
  if (withOptions > 0 && withOptions < q.errors.length)
    out.push(warn('/errors', 'only some errors have "options"; options are offered only when every error has them (otherwise they would give the bug lines away), so learners will type the fix instead'))
  return out
}

export const codeDebug: TypeModule<CodeDebugQuestion, CodeDebugInstance, CodeDebugAnswer> = {
  instantiate: (q, seed) => ({ type: 'code-debug', seed, question: q }),
  grade,
  check,
  emptyAnswer: () => ({ type: 'code-debug', marked: [], fixes: {} }),
}
