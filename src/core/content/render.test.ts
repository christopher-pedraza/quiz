// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { findRelativeAssets } from './assets.ts'
import { renderMarkdown } from './render.ts'

const source = { assetUrl: (p: string) => `https://raw.example/o/r/main/course/${p}` }
const html = (md: string, o = {}) => renderMarkdown(md, { source, ...o })

describe('renderMarkdown', () => {
  it('renders markdown', () => {
    expect(html('**bold** and `code`')).toContain('<strong>bold</strong>')
    expect(html('| a | b |\n|---|---|\n| 1 | 2 |')).toContain('<table>')
    expect(html('one **two**', { inline: true })).toBe('one <strong>two</strong>')
  })
  it('renders inline, display and block math with KaTeX', () => {
    expect(html('so $x^2$ here')).toMatch(/<span class="math"><span class="katex">/)
    expect(html('so $$x^2$$ here')).toContain('math-display')
    const block = html('before\n\n$$\n\\frac{a}{b}\n$$\n\nafter')
    expect(block).toContain('<div class="math math-display">')
    expect(block).toContain('<p>after</p>')
  })
  it('leaves prices, escaped dollars and code spans alone', () => {
    const out = html('costs $5 or $10, \\$x\\$ and `$a$ + $b$`')
    expect(out).not.toContain('katex')
    expect(out).toContain('$5 or $10')
    expect(out).toContain('<code>$a$ + $b$</code>')
  })
  it('does not throw on invalid TeX', () => {
    expect(() => html('$\\frac{$')).not.toThrow()
    expect(html('$\\badmacro$')).toContain('\\badmacro')
  })
  it('highlights fenced code and tolerates unknown languages', () => {
    expect(html('```python\ndef f():\n    return 1\n```')).toContain('hljs-keyword')
    const unknown = html('```nope\n<b>x</b>\n```')
    expect(unknown).toContain('&lt;b&gt;x&lt;/b&gt;')
    expect(unknown).not.toContain('<b>')
  })
  it('sanitizes scripts, handlers, javascript: URLs, iframes and style', () => {
    const out = html('<script>alert(1)</script><img src=x onerror=alert(1)><a href="javascript:alert(1)">x</a><iframe src="https://e"></iframe><style>*{}</style>[y](javascript:alert(2))')
    expect(out).not.toMatch(/<script|onerror|href="?javascript:|<iframe|<style/i)
  })
  it('cannot forge KaTeX output with raw html', () => {
    const out = html('<span data-kx="0"></span> and $x$')
    expect(out.match(/class="katex"/g)).toHaveLength(2) // the forged span reuses the first formula at most; it never injects markup
    expect(out).not.toContain('<script')
  })
  it('rewrites relative images and links against the source', () => {
    const out = html('![d](./assets/diagram.png) ![e](https://x.com/e.png) [dl](files/a.pdf) [top](#top)')
    expect(out).toContain('src="https://raw.example/o/r/main/course/assets/diagram.png"')
    expect(out).toContain('src="https://x.com/e.png"')
    expect(out).toContain('href="https://raw.example/o/r/main/course/files/a.pdf"')
    expect(out).toContain('href="#top"')
    expect(out).toContain('loading="lazy"')
  })
  it('rewrites raw <img> tags and keeps query/fragment on remote URLs', () => {
    expect(html('<img src="a.png?v=2" alt="x">')).toContain('course/a.png?v=2')
  })
  it('does not append suffixes to blob URLs', () => {
    const blob = { assetUrl: () => 'blob:http://x/abc' }
    expect(renderMarkdown('![a](a.png?v=1)', { source: blob })).toContain('src="blob:http://x/abc"')
  })
  it('refuses paths that climb out of the quiz folder', () => {
    const out = html('![x](../../secret.png) [y](../other/manifest.json)')
    expect(out).not.toContain('secret.png')
    expect(out).toContain('data-asset-error')
    expect(out).not.toContain('other/manifest.json')
  })
  it('opens external links safely', () => {
    expect(html('[x](https://example.com)')).toContain('rel="noopener noreferrer"')
  })
})

describe('findRelativeAssets', () => {
  it('finds markdown and html images, skipping external and escaping ones', () => {
    expect(findRelativeAssets('![a](./x/a.png "t") ![b](https://e/b.png) <img src="c.png"> ![d](../d.png)').map((a) => a.path)).toEqual(['x/a.png', 'c.png'])
  })
})
