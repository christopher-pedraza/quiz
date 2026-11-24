import type { CalcPart, CalculationQuestion, VariableSpec } from '../model/types.ts'
import { makeRng, pick, type Rng } from '../random.ts'
import { evalFormula, FormulaError, renderTemplate, RESERVED_NAMES, type Env } from '../text/formula.ts'
import { gradeNumeric } from '../text/numeric.ts'
import { err, result, type CheckIssue, type TypeModule } from './api.ts'

/** A template whose constraints are satisfied this rarely is a bad template. */
export const MAX_DRAWS = 2000

export interface ResolvedCalcQuestion extends Omit<CalculationQuestion, 'parts'> {
  parts: (CalcPart & { value: number })[]
}
export interface CalculationInstance {
  type: 'calculation'
  seed: number
  /** Placeholders rendered and every part's `value` computed. */
  question: ResolvedCalcQuestion
  /** The drawn variable values (empty for a static question). */
  vars: Record<string, number>
}
export type CalculationAnswer = { type: 'calculation'; values: Record<string, string> }

function drawVariable(name: string, spec: VariableSpec, env: Env, rng: Rng): number {
  if ('choices' in spec) return pick(spec.choices, rng)
  if ('formula' in spec) return evalFormula(spec.formula, env)
  const step = spec.step ?? 1
  const n = Math.floor((spec.max - spec.min) / step + 1e-9)
  if (!(step > 0) || n < 0) throw new FormulaError(`variable "${name}": needs step > 0 and min <= max`)
  return Number((spec.min + Math.floor(rng() * (n + 1)) * step).toPrecision(12))
}

/** Draws every variable in declaration order until all constraints hold. Throws FormulaError if they never do. */
export function drawVariables(q: Pick<CalculationQuestion, 'variables' | 'constraints'>, rng: Rng): Record<string, number> {
  for (let attempt = 0; attempt < MAX_DRAWS; attempt++) {
    const env: Record<string, number> = {}
    for (const [name, spec] of Object.entries(q.variables ?? {})) env[name] = drawVariable(name, spec, env, rng)
    if ((q.constraints ?? []).every((c) => evalFormula(c, env) !== 0)) return env
  }
  throw new FormulaError(`constraints could not be satisfied in ${MAX_DRAWS} draws`)
}

/** Renders and resolves one draw. Throws FormulaError on a broken template. */
function resolve(q: CalculationQuestion, env: Env): ResolvedCalcQuestion {
  const t = (s: string) => renderTemplate(s, env)
  return {
    ...q,
    ...(q.prompt !== undefined && { prompt: t(q.prompt) }),
    ...(q.code !== undefined && { code: t(q.code) }),
    ...(q.explanation !== undefined && { explanation: t(q.explanation) }),
    ...(q.hints && { hints: q.hints.map(t) }),
    parts: q.parts.map((p) => ({
      ...p,
      ...(p.label !== undefined && { label: t(p.label) }),
      ...(p.unit !== undefined && { unit: t(p.unit) }),
      value: p.formula !== undefined ? Number(evalFormula(p.formula, env).toPrecision(12)) : (p.value as number),
    })),
  }
}

function grade(inst: CalculationInstance, ans: CalculationAnswer) {
  const parts: Record<string, boolean> = {}
  for (const p of inst.question.parts) parts[p.id] = gradeNumeric(p.value, p.tolerance, ans.values[p.id] ?? '')
  return result(Object.values(parts).filter(Boolean).length / inst.question.parts.length, { parts })
}

const CHECK_DRAWS = 50

function check(q: CalculationQuestion): CheckIssue[] {
  const out: CheckIssue[] = []
  const ids = new Set<string>()
  q.parts.forEach((p, i) => {
    if (ids.has(p.id)) out.push(err(`/parts/${i}/id`, `duplicate part id "${p.id}"`))
    ids.add(p.id)
    if ((p.value === undefined) === (p.formula === undefined)) out.push(err(`/parts/${i}`, `part "${p.id}" needs exactly one of "value" or "formula"`))
  })
  for (const name of Object.keys(q.variables ?? {})) {
    if (RESERVED_NAMES.includes(name) || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(name))
      out.push(err(`/variables/${name}`, `"${name}" is not a valid variable name`, 'letters, digits and _; not a function or constant (pi, e, sqrt, …)'))
  }
  if (out.length) return out
  const rng = makeRng(12345)
  try {
    for (let i = 0; i < CHECK_DRAWS; i++) resolve(q, drawVariables(q, rng))
  } catch (e) {
    out.push(err('/variables', `template does not evaluate: ${(e as Error).message}`, 'check variable names, formulas, constraints and {{ }} placeholders'))
  }
  return out
}

export const calculation: TypeModule<CalculationQuestion, CalculationInstance, CalculationAnswer> = {
  instantiate(q, seed) {
    const vars = drawVariables(q, makeRng(seed))
    return { type: 'calculation', seed, question: resolve(q, vars), vars }
  },
  grade,
  check,
  emptyAnswer: () => ({ type: 'calculation', values: {} }),
}
