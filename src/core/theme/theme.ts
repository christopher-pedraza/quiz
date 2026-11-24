import type { Diagnostic, ThemeInput } from '../model/types.ts'

export interface ResolvedTheme {
  scheme?: 'dark' | 'light'
  /** CSS custom properties (and color-scheme), already validated: safe to assign with style.setProperty. */
  vars: Record<string, string>
}

const HEX = /^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i
const FUNC = /^(?:rgb|rgba|hsl|hsla|oklch)\(\s*[-+0-9a-z.%,/\s]+\)$/i
const FONT = /^[A-Za-z0-9 _"',.\-]{1,200}$/
const RADIUS = /^\d+(?:\.\d+)?(?:px|rem|em)$/

const KEYS = ['scheme', 'accent', 'accentSecondary', 'bgPrimary', 'bgSurface', 'fontSans', 'fontMono', 'radius'] as const

export const isColor = (s: string) => HEX.test(s) || FUNC.test(s)

type RGB = [number, number, number]

/** hex / rgb() / hsl() only. oklch() and anything else: null (no contrast maths possible). */
export function parseColor(s: string): RGB | null {
  if (HEX.test(s)) {
    let h = s.slice(1)
    if (h.length <= 4) h = [...h].map((c) => c + c).join('')
    return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as RGB
  }
  const m = /^(rgba?|hsla?)\(\s*([^)]*)\)$/i.exec(s)
  if (!m) return null
  const nums = m[2].split(/[\s,/]+/).filter(Boolean).slice(0, 3)
  if (nums.length < 3) return null
  if (m[1].toLowerCase().startsWith('rgb')) {
    const v = nums.map((n) => (n.endsWith('%') ? (parseFloat(n) / 100) * 255 : parseFloat(n)))
    return v.some(Number.isNaN) ? null : (v.map((x) => Math.max(0, Math.min(255, x))) as RGB)
  }
  const h = (((parseFloat(nums[0]) % 360) + 360) % 360) / 360
  const sat = parseFloat(nums[1]) / 100
  const l = parseFloat(nums[2]) / 100
  if ([h, sat, l].some(Number.isNaN)) return null
  const a = sat * Math.min(l, 1 - l)
  const f = (n: number) => {
    const k = (n + h * 12) % 12
    return 255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)))
  }
  return [f(0), f(8), f(4)]
}

export function luminance([r, g, b]: RGB): number {
  const c = [r, g, b].map((v) => {
    const s = v / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]
}

export function contrast(a: RGB, b: RGB): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

const SCHEME_DEFAULTS = {
  dark: { text: '#e6e8ee', bgPrimary: '#0f1115', bgSurface: '#171a21', accent: '#8b7bff', accentSecondary: '#22d3ee' },
  light: { text: '#14161c', bgPrimary: '#ffffff', bgSurface: '#f4f5f7', accent: '#5b45e0', accentSecondary: '#0891b2' },
} as const

/**
 * Validates an author's theme token by token. An invalid token is dropped with a warning; the rest still applies.
 * Returns theme: undefined when there is nothing to apply (the app default theme stays).
 */
export function resolveTheme(raw: unknown, file = 'theme.json'): { theme?: ResolvedTheme; diagnostics: Diagnostic[] } {
  const diagnostics: Diagnostic[] = []
  const warn = (path: string, message: string, hint?: string) => diagnostics.push({ severity: 'warning', file, path, message, ...(hint && { hint }) })
  if (raw === undefined) return { diagnostics }
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    warn('/', 'the theme must be a JSON object; ignoring it')
    return { diagnostics }
  }
  const t = raw as Record<string, unknown>
  for (const k of Object.keys(t)) if (k !== '$schema' && !(KEYS as readonly string[]).includes(k)) warn(`/${k}`, `unknown theme token "${k}"`, `known tokens: ${KEYS.join(', ')}`)

  const str = (k: keyof ThemeInput, ok: (s: string) => boolean, hint: string): string | undefined => {
    const v = t[k]
    if (v === undefined) return undefined
    if (typeof v !== 'string' || !ok(v.trim())) {
      warn(`/${k}`, `invalid "${k}": ${JSON.stringify(v)}; ignored`, hint)
      return undefined
    }
    return v.trim()
  }
  const colorHint = 'use #rrggbb, rgb(), hsl() or oklch()'
  const accent = str('accent', isColor, colorHint)
  const accent2 = str('accentSecondary', isColor, colorHint)
  let bg = str('bgPrimary', isColor, colorHint)
  let surface = str('bgSurface', isColor, colorHint)
  const fontSans = str('fontSans', (s) => FONT.test(s), 'a comma-separated list of font family names, e.g. Inter, system-ui, sans-serif')
  const fontMono = str('fontMono', (s) => FONT.test(s), 'a comma-separated list of font family names')
  const radius = str('radius', (s) => RADIUS.test(s), 'e.g. 8px or 0.5rem')
  let scheme: 'dark' | 'light' | undefined
  if (t.scheme !== undefined) {
    if (t.scheme === 'dark' || t.scheme === 'light') scheme = t.scheme
    else warn('/scheme', `"scheme" must be "dark" or "light", got ${JSON.stringify(t.scheme)}; ignored`)
  }
  const bgRgb = bg ? parseColor(bg) : null
  if (!scheme && bgRgb) scheme = luminance(bgRgb) > 0.4 ? 'light' : 'dark'

  const vars: Record<string, string> = {}
  let accentOut = accent
  if (scheme) {
    const d = SCHEME_DEFAULTS[scheme]
    bg ??= d.bgPrimary
    surface ??= bg === d.bgPrimary ? d.bgSurface : undefined
    accentOut ??= d.accent
    vars['color-scheme'] = scheme
    vars['--text'] = d.text
    vars['--text-muted'] = 'color-mix(in srgb, var(--text) 68%, var(--bg-surface))'
    vars['--border'] = 'color-mix(in srgb, var(--text) 16%, transparent)'
    vars['--accent-secondary'] = accent2 ?? d.accentSecondary
  } else if (accent2) vars['--accent-secondary'] = accent2
  if (bg) vars['--bg-primary'] = bg
  if (surface) vars['--bg-surface'] = surface
  else if (bg && scheme) vars['--bg-surface'] = `color-mix(in srgb, ${bg} 92%, ${scheme === 'dark' ? 'white' : 'black'})`
  if (accentOut) vars['--accent'] = accentOut
  if (fontSans) vars['--font-sans'] = fontSans
  if (fontMono) vars['--font-mono'] = fontMono
  if (radius) vars['--radius'] = radius

  const accRgb = accentOut ? parseColor(accentOut) : null
  if (accRgb) vars['--on-accent'] = contrast(accRgb, [255, 255, 255]) >= contrast(accRgb, [0, 0, 0]) ? '#ffffff' : '#000000'

  if (scheme && bgRgb) {
    const textRgb = parseColor(SCHEME_DEFAULTS[scheme].text)!
    const c = contrast(textRgb, bgRgb)
    if (c < 4.5) warn('/bgPrimary', `text on bgPrimary has contrast ${c.toFixed(1)}:1 (< 4.5:1) for the ${scheme} scheme`, `a ${scheme === 'dark' ? 'darker' : 'lighter'} background or a different scheme would be easier to read`)
  }
  const surfRgb = surface ? parseColor(surface) : bgRgb
  if (accRgb && surfRgb) {
    const c = contrast(accRgb, surfRgb)
    if (c < 3) warn('/accent', `accent on the background has contrast ${c.toFixed(1)}:1 (< 3:1), so buttons and focus rings will be hard to see`)
  }
  return { theme: Object.keys(vars).length ? { scheme, vars } : undefined, diagnostics }
}

interface StyleTarget {
  style: { setProperty(k: string, v: string): void; removeProperty(k: string): void }
  dataset: Record<string, string | undefined>
}

/** Applies (or, with undefined, clears) a resolved theme on an element, removing whatever a previous theme set. */
export function applyTheme(el: StyleTarget, theme: ResolvedTheme | undefined): void {
  for (const k of (el.dataset.themeKeys ?? '').split(',').filter(Boolean)) el.style.removeProperty(k)
  if (!theme) {
    delete el.dataset.themeKeys
    return
  }
  for (const [k, v] of Object.entries(theme.vars)) el.style.setProperty(k, v)
  el.dataset.themeKeys = Object.keys(theme.vars).join(',')
}
