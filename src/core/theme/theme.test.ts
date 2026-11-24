import { describe, expect, it } from 'vitest'
import { applyTheme, contrast, parseColor, resolveTheme } from './theme.ts'

describe('resolveTheme', () => {
  it('maps tokens to custom properties and derives the rest from the scheme', () => {
    const { theme, diagnostics } = resolveTheme({
      scheme: 'dark', accent: '#7c5cff', accentSecondary: '#22d3ee', bgPrimary: '#0b0d12', bgSurface: '#141824',
      fontSans: 'Inter, system-ui, sans-serif', fontMono: '"JetBrains Mono", monospace', radius: '10px',
    })
    expect(diagnostics).toEqual([])
    expect(theme?.vars).toMatchObject({
      'color-scheme': 'dark', '--accent': '#7c5cff', '--accent-secondary': '#22d3ee', '--bg-primary': '#0b0d12', '--bg-surface': '#141824',
      '--font-sans': 'Inter, system-ui, sans-serif', '--font-mono': '"JetBrains Mono", monospace', '--radius': '10px', '--text': '#e6e8ee',
    })
    expect(theme?.vars['--on-accent']).toBe('#000000') // black has the higher contrast on this accent
  })
  it('returns no theme when nothing is specified', () => {
    expect(resolveTheme(undefined)).toEqual({ diagnostics: [] })
    expect(resolveTheme({}).theme).toBeUndefined()
  })
  it('a lone accent leaves the app scheme alone', () => {
    const { theme } = resolveTheme({ accent: 'rgb(10, 200, 30)' })
    expect(theme?.scheme).toBeUndefined()
    expect(theme?.vars['color-scheme']).toBeUndefined()
    expect(theme?.vars['--accent']).toBe('rgb(10, 200, 30)')
  })
  it('infers the scheme from a parseable background', () => {
    expect(resolveTheme({ bgPrimary: '#ffffff' }).theme?.scheme).toBe('light')
    expect(resolveTheme({ bgPrimary: '#101010' }).theme?.scheme).toBe('dark')
  })
  it('drops injection attempts per token, keeps the rest', () => {
    const { theme, diagnostics } = resolveTheme({
      accent: 'red; background: url(http://evil)', fontSans: 'x; } body { display:none', radius: '10px; x', bgPrimary: 'url(x)', fontMono: 'Fira Code, monospace',
    })
    expect(Object.keys(theme!.vars)).toEqual(['--font-mono'])
    expect(diagnostics.map((d) => d.path).sort()).toEqual(['/accent', '/bgPrimary', '/fontSans', '/radius'])
    for (const v of Object.values(theme!.vars)) expect(v).not.toMatch(/[;{}]|url\(/)
  })
  it('warns on unknown tokens and bad scheme, ignores $schema', () => {
    const { diagnostics } = resolveTheme({ $schema: 'x', colour: 'red', scheme: 'sepia' })
    expect(diagnostics.map((d) => d.path).sort()).toEqual(['/colour', '/scheme'])
  })
  it('warns about unreadable combinations', () => {
    const { diagnostics } = resolveTheme({ scheme: 'dark', bgPrimary: '#f0f0f0' })
    expect(diagnostics[0]).toMatchObject({ severity: 'warning', path: '/bgPrimary' })
    expect(resolveTheme({ bgPrimary: '#ffffff', accent: '#fafafa' }).diagnostics.some((d) => d.path === '/accent')).toBe(true)
  })
  it('non-objects are ignored with a warning', () => {
    expect(resolveTheme('nope').diagnostics).toHaveLength(1)
  })
  it('picks a readable on-accent color', () => {
    expect(resolveTheme({ accent: '#ffee00' }).theme?.vars['--on-accent']).toBe('#000000')
    expect(resolveTheme({ accent: '#220066' }).theme?.vars['--on-accent']).toBe('#ffffff')
  })
})

describe('colors', () => {
  it('parses hex, rgb and hsl; gives up on oklch', () => {
    expect(parseColor('#fff')).toEqual([255, 255, 255])
    expect(parseColor('#00ff0080')).toEqual([0, 255, 0])
    expect(parseColor('rgb(1, 2, 3)')).toEqual([1, 2, 3])
    expect(parseColor('hsl(0 100% 50%)')!.map(Math.round)).toEqual([255, 0, 0])
    expect(parseColor('oklch(0.7 0.1 200)')).toBeNull()
    expect(contrast([0, 0, 0], [255, 255, 255])).toBeCloseTo(21)
  })
})

describe('applyTheme', () => {
  const el = () => {
    const props = new Map<string, string>()
    return { props, style: { setProperty: (k: string, v: string) => props.set(k, v), removeProperty: (k: string) => void props.delete(k) }, dataset: {} as Record<string, string | undefined> }
  }
  it('applies, replaces and clears', () => {
    const e = el()
    applyTheme(e, resolveTheme({ accent: '#112233', radius: '4px' }).theme)
    expect([...e.props.keys()].sort()).toEqual(['--accent', '--on-accent', '--radius'])
    applyTheme(e, resolveTheme({ fontMono: 'monospace' }).theme)
    expect([...e.props.keys()]).toEqual(['--font-mono'])
    applyTheme(e, undefined)
    expect(e.props.size).toBe(0)
  })
})
