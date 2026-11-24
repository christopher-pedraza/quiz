// Formula language for generated questions (variables, derived values, constraints and the
// `{{ ... }}` placeholders in question text). This is the AUTHOR-side language and deliberately
// stricter than numeric.ts, which parses what a learner types (thousands separators, implicit
// multiplication, ...). No eval(): a small recursive-descent parser. Pure and dependency-free.
//
//   numbers      3  0.5  1e-3
//   variables    H  stride_x          (declared in the question's `variables`)
//   operators    + - * / % ^ **       (^ and ** are powers, right-associative)
//   comparison   < <= > >= == !=      (result is 1 or 0)
//   logic        && || !              (any non-zero value is true; result is 1 or 0)
//   functions    floor ceil round trunc abs sign sqrt exp ln log log2 log10 min max pow
//   constants    pi e                 (so `pi` and `e` cannot be variable names)

export type Env = Readonly<Record<string, number>>

export class FormulaError extends Error {}

const FUNCS: Record<string, { arity: number | 'any'; fn: (...a: number[]) => number }> = {
  floor: { arity: 1, fn: Math.floor },
  ceil: { arity: 1, fn: Math.ceil },
  round: { arity: 1, fn: Math.round },
  trunc: { arity: 1, fn: Math.trunc },
  abs: { arity: 1, fn: Math.abs },
  sign: { arity: 1, fn: Math.sign },
  sqrt: { arity: 1, fn: Math.sqrt },
  exp: { arity: 1, fn: Math.exp },
  ln: { arity: 1, fn: Math.log },
  log: { arity: 1, fn: Math.log }, // natural log, as everywhere in ML
  log2: { arity: 1, fn: Math.log2 },
  log10: { arity: 1, fn: Math.log10 },
  pow: { arity: 2, fn: Math.pow },
  min: { arity: 'any', fn: Math.min },
  max: { arity: 'any', fn: Math.max },
}
const CONSTS: Record<string, number> = { pi: Math.PI, e: Math.E }

/** Names a variable may not take. */
export const RESERVED_NAMES: readonly string[] = [...Object.keys(FUNCS), ...Object.keys(CONSTS)]

type Tok = { n: number } | { id: string } | { op: string }

const TOKEN = /\s*(?:(\d+\.?\d*(?:[eE][+-]?\d+)?|\.\d+(?:[eE][+-]?\d+)?)|([A-Za-z_][A-Za-z0-9_]*)|(\*\*|<=|>=|==|!=|&&|\|\||[-+*/%^()<>!,]))/y

function tokenize(src: string): Tok[] {
  const out: Tok[] = []
  let pos = 0
  while (pos < src.length) {
    if (/^\s*$/.test(src.slice(pos))) break
    TOKEN.lastIndex = pos
    const m = TOKEN.exec(src)
    if (!m) throw new FormulaError(`unexpected character at "${src.slice(pos, pos + 10).trim()}" in "${src}"`)
    pos = TOKEN.lastIndex
    if (m[1] !== undefined) out.push({ n: Number(m[1]) })
    else if (m[2] !== undefined) out.push({ id: m[2] })
    else out.push({ op: m[3] === '**' ? '^' : m[3] })
  }
  return out
}

/** Evaluates `src` with the given variables. Throws FormulaError on syntax errors, unknown names and non-finite results. */
export function evalFormula(src: string, env: Env = {}): number {
  const toks = tokenize(src)
  if (toks.length === 0) throw new FormulaError('empty formula')
  let i = 0
  const fail = (msg: string): never => {
    throw new FormulaError(`${msg} in "${src}"`)
  }
  const peekOp = () => {
    const t = toks[i]
    return t && 'op' in t ? t.op : undefined
  }
  const expectOp = (op: string) => {
    if (peekOp() !== op) fail(`expected "${op}"`)
    i++
  }
  const bool = (b: boolean) => (b ? 1 : 0)

  function or(): number {
    let v = and()
    while (peekOp() === '||') {
      i++
      const r = and()
      v = bool(v !== 0 || r !== 0)
    }
    return v
  }
  function and(): number {
    let v = cmp()
    while (peekOp() === '&&') {
      i++
      const r = cmp()
      v = bool(v !== 0 && r !== 0)
    }
    return v
  }
  function cmp(): number {
    const v = add()
    const o = peekOp()
    if (o === '<' || o === '<=' || o === '>' || o === '>=' || o === '==' || o === '!=') {
      i++
      const r = add()
      switch (o) {
        case '<': return bool(v < r)
        case '<=': return bool(v <= r)
        case '>': return bool(v > r)
        case '>=': return bool(v >= r)
        // Tolerant of float noise from derived values such as 0.1 * 3.
        case '==': return bool(Math.abs(v - r) <= 1e-9 * Math.max(1, Math.abs(v), Math.abs(r)))
        default: return bool(Math.abs(v - r) > 1e-9 * Math.max(1, Math.abs(v), Math.abs(r)))
      }
    }
    return v
  }
  function add(): number {
    let v = mul()
    for (let o = peekOp(); o === '+' || o === '-'; o = peekOp()) {
      i++
      const r = mul()
      v = o === '+' ? v + r : v - r
    }
    return v
  }
  function mul(): number {
    let v = unary()
    for (let o = peekOp(); o === '*' || o === '/' || o === '%'; o = peekOp()) {
      i++
      const r = unary()
      if ((o === '/' || o === '%') && r === 0) fail('division by zero')
      v = o === '*' ? v * r : o === '/' ? v / r : v % r
    }
    return v
  }
  function unary(): number {
    const o = peekOp()
    if (o === '-' || o === '+' || o === '!') {
      i++
      const v = unary()
      return o === '-' ? -v : o === '+' ? v : bool(v === 0)
    }
    return power()
  }
  function power(): number {
    const base = atom()
    if (peekOp() === '^') {
      i++
      return Math.pow(base, unary())
    }
    return base
  }
  function atom(): number {
    const t = toks[i++]
    if (!t) return fail('unexpected end')
    if ('n' in t) return t.n
    if ('id' in t) {
      if (peekOp() === '(') {
        const f = FUNCS[t.id]
        if (!f) return fail(`unknown function "${t.id}"`)
        i++
        const args: number[] = []
        if (peekOp() !== ')') {
          args.push(or())
          while (peekOp() === ',') {
            i++
            args.push(or())
          }
        }
        expectOp(')')
        if (f.arity === 'any' ? args.length === 0 : args.length !== f.arity)
          return fail(`${t.id}() takes ${f.arity === 'any' ? 'at least one argument' : `${f.arity} argument(s)`}`)
        return f.fn(...args)
      }
      if (t.id in env) return env[t.id]
      if (t.id in CONSTS) return CONSTS[t.id]
      return fail(`unknown variable "${t.id}"`)
    }
    if (t.op === '(') {
      const v = or()
      expectOp(')')
      return v
    }
    return fail(`unexpected "${t.op}"`)
  }

  const v = or()
  if (i !== toks.length) fail('unexpected trailing input')
  if (!Number.isFinite(v)) fail('result is not a finite number')
  return v
}

/** Number as it should read inside question text: no float noise, no exponent for everyday magnitudes. */
export function formatNumber(v: number, decimals?: number): string {
  if (decimals !== undefined) return v.toFixed(decimals)
  if (Number.isInteger(v)) return String(v)
  return String(Number(v.toPrecision(10)))
}

const PLACEHOLDER = /\{\{\s*([^{}]+?)\s*\}\}/g

/**
 * Replaces every `{{ expr }}` (or `{{ expr:N }}` for N decimals) in `text` with its value under `env`.
 * Any formula is allowed, so `{{H}}`, `{{H*2}}` and `{{floor((H+2*p-k)/s)+1}}` all work.
 */
export function renderTemplate(text: string, env: Env): string {
  return text.replace(PLACEHOLDER, (_, inner: string) => {
    const m = /^([\s\S]*?)\s*:\s*(\d+)$/.exec(inner)
    return m ? formatNumber(evalFormula(m[1], env), Number(m[2])) : formatNumber(evalFormula(inner, env))
  })
}
