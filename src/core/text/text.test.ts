import { describe, expect, it } from 'vitest'
import { matchesAny, normalizeCode, normalizeProse } from './normalize.ts'
import { formatValue, gradeNumeric, parseNumeric, withinTolerance } from './numeric.ts'
import { evalFormula, FormulaError, renderTemplate } from './formula.ts'

describe('normalize', () => {
  it('ignores spacing around punctuation and quote style in code', () => {
    expect(normalizeCode("x=a+b")).toBe(normalizeCode('x = a + b'))
    expect(normalizeCode("f('a')")).toBe(normalizeCode('f("a")'))
    expect(normalizeCode('not x')).not.toBe(normalizeCode('notx'))
  })
  it('code is case sensitive, prose is not', () => {
    expect(matchesAny('Foo', ['foo'])).toBe(false)
    expect(matchesAny('Foo.', ['foo'], [], { kind: 'prose' })).toBe(true)
    expect(matchesAny('Foo', ['foo'], [], { kind: 'prose', caseSensitive: true })).toBe(false)
  })
  it('prose ignores surrounding punctuation', () => {
    expect(normalizeProse('  “Merge   Sort”. ')).toBe('Merge Sort')
  })
  it('matches anchored patterns and survives invalid ones', () => {
    expect(matchesAny('torch.zeros(3)', [], ['torch\\.zeros\\(\\d+\\)'])).toBe(true)
    expect(matchesAny('xtorch.zeros(3)', [], ['torch\\.zeros\\(\\d+\\)'])).toBe(false)
    expect(matchesAny('a', [], ['('])).toBe(false)
  })
  it('empty input never matches', () => {
    expect(matchesAny('   ', ['x'])).toBe(false)
  })
})

describe('parseNumeric', () => {
  it.each([
    ['2,598', 2598],
    ['432*6+6', 2598],
    ['(3*12*12+1)*6', 2598],
    ['(3*12*12+1)6', 2598],
    ['2^10', 1024],
    ['2**3**2', 512],
    ['3pi', 3 * Math.PI],
    ['sqrt(16)', 4],
    ['1e-3', 0.001],
    ['−4 × 2', -8],
  ])('parses %s', (src, v) => expect(parseNumeric(src)).toBeCloseTo(v, 9))
  it.each(['', 'abc', '2 598', '1/0', '(1', '2+'])('rejects %j', (src) => expect(parseNumeric(src)).toBeNull())
})

describe('tolerance', () => {
  it('is exact by default', () => {
    expect(withinTolerance(0.1 + 0.2, 0.3)).toBe(true)
    expect(withinTolerance(0.31, 0.3)).toBe(false)
  })
  it('numbers are absolute', () => {
    expect(withinTolerance(10.01, 10, 0.01)).toBe(true)
    expect(withinTolerance(10.02, 10, 0.01)).toBe(false)
  })
  it('relative', () => {
    expect(withinTolerance(102, 100, { rel: 0.02 })).toBe(true)
    expect(withinTolerance(103, 100, { rel: 0.02 })).toBe(false)
    expect(withinTolerance(-98, -100, { rel: 0.02 })).toBe(true)
  })
  it('abs OR rel', () => {
    expect(withinTolerance(0.5, 0, { abs: 1, rel: 0.01 })).toBe(true)
    expect(withinTolerance(1000.5, 1000, { abs: 0.1, rel: 0.01 })).toBe(true)
  })
  it('grades typed expressions', () => {
    expect(gradeNumeric(2598, undefined, '432*6+6')).toBe(true)
    expect(gradeNumeric(2598, undefined, 'nope')).toBe(false)
    expect(formatValue(2598)).toBe('2,598')
  })
})

describe('formula', () => {
  it('evaluates with precedence and functions', () => {
    expect(evalFormula('floor((H + 2*p - k)/s) + 1', { H: 32, p: 1, k: 3, s: 2 })).toBe(16)
    expect(evalFormula('2^3^2')).toBe(512)
    expect(evalFormula('max(1,2,3) > 2 && !0')).toBe(1)
  })
  it('rejects unknown names, division by zero, trailing input', () => {
    expect(() => evalFormula('x + 1')).toThrow(FormulaError)
    expect(() => evalFormula('1/0')).toThrow(FormulaError)
    expect(() => evalFormula('1 2')).toThrow(FormulaError)
    expect(() => evalFormula('')).toThrow(FormulaError)
  })
  it('renders templates with optional decimals', () => {
    expect(renderTemplate('{{H}} x {{ H*2 }} = {{ H/3 : 2 }}', { H: 6 })).toBe('6 x 12 = 2.00')
  })
})
