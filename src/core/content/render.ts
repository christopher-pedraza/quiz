import DOMPurify from 'dompurify'
import hljs from 'highlight.js/lib/common'
import katex from 'katex'
import { Marked, type TokenizerAndRendererExtension } from 'marked'
import { resolveRelative } from '../source/paths.ts'
import type { QuizSource } from '../source/types.ts'

export interface RenderOptions {
  /** Resolves relative images and links; without it relative URLs are left untouched. */
  source?: Pick<QuizSource, 'assetUrl'>
  /** Render a single line of inline Markdown (no <p> wrapper). */
  inline?: boolean
}

// KaTeX output is produced AFTER sanitizing, from a placeholder, so an author cannot forge it with raw HTML.
let math: { tex: string; display: boolean }[] = []
const placeholder = (display: boolean, tex: string) => {
  math.push({ tex, display })
  return display ? `<div data-kx="${math.length - 1}"></div>` : `<span data-kx="${math.length - 1}"></span>`
}

// Same rules as the reference app: "$5 or $10" is not math; inline math must hug its delimiters.
const INLINE_DISPLAY = /^\$\$(?!\$)([\s\S]+?)\$\$/
// The body cannot contain a backtick: code spans win over math, so `$a$` is never math.
const INLINE = /^\$(?=[^\s$])((?:\\.|[^$\n\\`])*?(?:\\.|[^\s$\\`]))\$(?!\d)/
const BLOCK = /^\$\$[ \t]*\n([\s\S]+?)\n[ \t]*\$\$[ \t]*(?:\n|$)/

const inlineMath: TokenizerAndRendererExtension = {
  name: 'inlineMath',
  level: 'inline',
  start: (src) => src.indexOf('$'),
  tokenizer(src) {
    const d = INLINE_DISPLAY.exec(src)
    if (d) return { type: 'inlineMath', raw: d[0], text: d[1].trim(), display: true }
    const i = INLINE.exec(src)
    if (i) return { type: 'inlineMath', raw: i[0], text: i[1], display: false }
    return undefined
  },
  renderer: (t) => placeholder(Boolean(t.display), String(t.text)),
}
const blockMath: TokenizerAndRendererExtension = {
  name: 'blockMath',
  level: 'block',
  start: (src) => src.indexOf('$$'),
  tokenizer(src) {
    const m = BLOCK.exec(src)
    return m ? { type: 'blockMath', raw: m[0], text: m[1].trim() } : undefined
  },
  renderer: (t) => placeholder(true, String(t.text)) + '\n',
}

const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

export function highlightCode(code: string, lang?: string): string {
  const l = lang?.trim().toLowerCase()
  if (l && hljs.getLanguage(l)) return hljs.highlight(code, { language: l, ignoreIllegals: true }).value
  return escapeHtml(code)
}

const md = new Marked({
  gfm: true,
  extensions: [blockMath, inlineMath],
  renderer: {
    code({ text, lang }) {
      const l = (lang ?? '').split(/\s+/)[0]
      return `<pre><code class="hljs${l ? ` language-${escapeHtml(l)}` : ''}">${highlightCode(text, l)}</code></pre>\n`
    },
  },
})

// DOMPurify allows <style> and form controls by default; neither belongs in quiz content.
const FORBID = ['style', 'form', 'input', 'button', 'textarea', 'select', 'option', 'link', 'meta', 'base', 'iframe', 'object', 'embed']

const SRC_TAGS = 'img,video,audio,source'

function rewrite(root: ParentNode, source: RenderOptions['source']) {
  for (const el of Array.from(root.querySelectorAll(SRC_TAGS))) {
    const src = el.getAttribute('src')
    if (src === null) continue
    const r = resolveRelative(src)
    if (r.kind === 'path' && source) {
      const url = source.assetUrl(r.path)
      el.setAttribute('src', url.startsWith('blob:') ? url : url + r.suffix)
    } else if (r.kind === 'escape') {
      el.removeAttribute('src')
      el.setAttribute('data-asset-error', 'path leaves the quiz folder')
    } else if (r.kind === 'external') {
      el.setAttribute('referrerpolicy', 'no-referrer')
    }
    if (el.tagName === 'IMG') el.setAttribute('loading', 'lazy')
  }
  for (const a of Array.from(root.querySelectorAll('a[href]'))) {
    const href = a.getAttribute('href')!
    const r = resolveRelative(href)
    if (r.kind === 'path' && source) {
      const url = source.assetUrl(r.path)
      a.setAttribute('href', url.startsWith('blob:') ? url : url + r.suffix)
      a.setAttribute('target', '_blank')
      a.setAttribute('rel', 'noopener noreferrer')
    } else if (r.kind === 'escape') a.removeAttribute('href')
    else if (r.kind === 'external') {
      a.setAttribute('target', '_blank')
      a.setAttribute('rel', 'noopener noreferrer')
    }
  }
}

/** Markdown (+ $math$, ``` code ```, relative images) → sanitized HTML. Needs a DOM (browser, or jsdom in tests). */
export function renderMarkdown(text: string, opts: RenderOptions = {}): string {
  math = []
  const rawHtml = opts.inline ? (md.parseInline(text) as string) : (md.parse(text) as string)
  const formulas = math
  math = []
  const root = document.createElement('div')
  root.append(DOMPurify.sanitize(rawHtml, { RETURN_DOM_FRAGMENT: true, FORBID_TAGS: FORBID, FORBID_ATTR: ['style'] }))
  for (const el of Array.from(root.querySelectorAll('[data-kx]'))) {
    const f = formulas[Number(el.getAttribute('data-kx'))]
    el.removeAttribute('data-kx')
    if (!f) continue
    el.className = f.display ? 'math math-display' : 'math'
    el.innerHTML = katex.renderToString(f.tex, { displayMode: f.display, throwOnError: false, strict: 'ignore', trust: false, output: 'htmlAndMathml' })
  }
  rewrite(root, opts.source)
  return root.innerHTML
}
