import { describe, expect, it } from 'vitest'
import { decodePreset, encodePreset } from './preset.ts'
import { buildShareUrl, parseLocation } from './url.ts'

const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url')

describe('location', () => {
  it('parses readable params with defaults', () => {
    expect(parseLocation('?repo=octocat/quizzes&path=course-1/midterm&ref=dev').source).toEqual({ kind: 'github', owner: 'octocat', repo: 'quizzes', ref: 'dev', path: 'course-1/midterm' })
    expect(parseLocation('?repo=octocat/quizzes').source).toEqual({ kind: 'github', owner: 'octocat', repo: 'quizzes', ref: 'main', path: '' })
    expect(parseLocation('?repo=o%2Fr&path=a%2Fb').source).toMatchObject({ repo: 'r', path: 'a/b' })
  })
  it('handles refs with slashes and sample links', () => {
    expect(parseLocation('?repo=o/r&ref=feature/x').source).toMatchObject({ ref: 'feature/x' })
    expect(parseLocation('?sample=demo').source).toEqual({ kind: 'sample', name: 'demo' })
  })
  it('reports junk instead of throwing', () => {
    expect(parseLocation('').errors).toEqual([])
    expect(parseLocation('?repo=nope').errors[0]).toContain('invalid link')
    expect(parseLocation('?repo=o/r&path=../x').source).toBeUndefined()
    expect(parseLocation('?sample=../x').errors).toHaveLength(1)
  })
  it('round-trips through buildShareUrl', () => {
    for (const source of [
      { kind: 'github', owner: 'o', repo: 'r', ref: 'main', path: '' },
      { kind: 'github', owner: 'o', repo: 'r.js', ref: 'feature/x y', path: 'course 1/mid term' },
      { kind: 'sample', name: 'demo' },
    ] as const) {
      const url = buildShareUrl('https://x.github.io/quiz/', source)
      expect(parseLocation(url.slice(url.indexOf('?'))).source).toEqual(source)
    }
  })
  it('keeps links readable', () => {
    expect(buildShareUrl('https://x/', { kind: 'github', owner: 'o', repo: 'r', ref: 'main', path: 'c/m' })).toBe('https://x/?repo=o/r&path=c/m')
    expect(buildShareUrl('https://x/', { kind: 'github', owner: 'o', repo: 'r', ref: 'v2', path: '' })).toBe('https://x/?repo=o/r&ref=v2')
  })
  it('carries a preset and ignores a bad one', () => {
    const src = { kind: 'github', owner: 'o', repo: 'r', ref: 'main', path: '' } as const
    const url = buildShareUrl('https://x/', src, { count: 10, minutes: 30, weights: { a: 70, b: 30 }, seed: 7 })
    const loc = parseLocation(url.slice(url.indexOf('?')))
    expect(loc.preset).toEqual({ count: 10, minutes: 30, weights: { a: 70, b: 30 }, seed: 7 })
    const bad = parseLocation('?repo=o/r&preset=@@@')
    expect(bad.source).toBeDefined()
    expect(bad.preset).toBeUndefined()
    expect(bad.errors[0]).toContain('damaged')
  })
})

describe('preset', () => {
  it('round-trips every field, including unicode topic ids', () => {
    const p = { count: 25, minutes: 45, topics: ['séance', 'b'], types: ['mcq', 'ordering'] as const, difficulties: ['hard'] as const, weights: { 'séance': 60, b: 40 }, seed: 4294967295, shuffle: false }
    expect(decodePreset(encodePreset({ ...p, types: [...p.types], difficulties: [...p.difficulties] })).preset).toEqual(p)
  })
  it('is url-safe and omits defaults', () => {
    const s = encodePreset({ count: 5 })
    expect(s).toMatch(/^[A-Za-z0-9_-]+$/)
    expect(JSON.parse(Buffer.from(s, 'base64url').toString())).toEqual({ v: 1, n: 5 })
  })
  it('clamps and filters hostile input', () => {
    const d = decodePreset(b64({ v: 1, n: 1e9, m: -5, tp: ['a', 5, ''], ty: ['mcq', 'evil'], d: ['hard', 'x'], w: { a: 500, b: 'x', c: -1 }, seed: 1e20, sh: 1 })).preset!
    expect(d).toEqual({ count: 500, topics: ['a'], types: ['mcq'], difficulties: ['hard'], weights: { a: 100 }, seed: 4294967295 })
  })
  it('rejects wrong versions, non-objects, garbage and oversized payloads', () => {
    expect(decodePreset(b64({ v: 2 })).error).toContain('unsupported version')
    expect(decodePreset(b64([1])).error).toContain('damaged')
    expect(decodePreset('%%%').error).toContain('damaged')
    expect(decodePreset(Buffer.from([0xff, 0xfe]).toString('base64url')).error).toContain('damaged')
    expect(decodePreset('a'.repeat(5000)).error).toContain('too large')
  })
})
