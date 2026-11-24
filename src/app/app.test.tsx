// @vitest-environment jsdom
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readFolder } from '../../scripts/folder.ts'
import { App } from './App.tsx'

const demo = readFolder(join(process.cwd(), 'public/samples/demo'))
const res = (status: number, body = '') => ({ ok: status < 300, status, text: async () => body }) as Response

/** Serves the demo folder at the bundled-sample URL and 404s everything else (GitHub included). */
function stubFetch(extra: Record<string, string> = {}) {
  const calls: string[] = []
  vi.stubGlobal('fetch', async (input: RequestInfo | URL) => {
    const url = String(input)
    calls.push(url)
    const m = /samples\/demo\/(.+)$/.exec(url)
    if (m && decodeURIComponent(m[1]) in demo) return res(200, demo[decodeURIComponent(m[1])])
    for (const [k, v] of Object.entries(extra)) if (url.endsWith(k)) return res(200, v)
    return res(404)
  })
  return calls
}

const go = (url: string) => window.history.pushState(null, '', url)
beforeEach(() => {
  localStorage.clear()
  go('/')
  window.location.hash = ''
})
afterEach(() => {
  vi.unstubAllGlobals()
  document.documentElement.removeAttribute('style')
})

describe('hub', () => {
  it('shows the landing screen with every way in', () => {
    stubFetch()
    render(<App />)
    expect(screen.getByRole('textbox', { name: 'GitHub folder URL' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Load local folder' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Try the sample quiz' })).toBeTruthy()
    expect(screen.queryByRole('region', { name: 'Recent quizzes' })).toBeNull()
  })

  it('rejects input that is not a GitHub folder, with a reason', async () => {
    stubFetch()
    const u = userEvent.setup()
    render(<App />)
    await u.type(screen.getByRole('textbox', { name: 'GitHub folder URL' }), 'https://gitlab.com/a/b{Enter}')
    expect((await screen.findByRole('alert')).textContent).toContain('only github.com')
  })

  it('opens the sample: loads it, applies the quiz theme, rewrites the address, and remembers it', async () => {
    stubFetch()
    const u = userEvent.setup()
    render(<App />)
    await u.click(screen.getByRole('button', { name: 'Try the sample quiz' }))
    expect(await screen.findByRole('heading', { level: 1, name: /Deep Learning Basics/ })).toBeTruthy()
    expect(window.location.search).toBe('?sample=demo')
    expect(document.documentElement.style.getPropertyValue('--accent')).toBe('#8b7bff')
    expect(document.documentElement.style.getPropertyValue('color-scheme')).toBe('dark')
    expect(document.title).toContain('Deep Learning Basics')
    expect(screen.getByRole('button', { name: 'Reference' })).toBeTruthy()

    // back to the start: theme is gone, the quiz is in Recent, and it reopens from there
    await u.click(screen.getByRole('button', { name: 'Back to start' }))
    expect(document.documentElement.style.getPropertyValue('--accent')).toBe('')
    expect(window.location.search).toBe('')
    const recent = screen.getByRole('region', { name: 'Recent quizzes' })
    expect(within(recent).getByText('Deep Learning Basics (sample quiz)')).toBeTruthy()
    await u.click(within(recent).getByText('Deep Learning Basics (sample quiz)'))
    expect(await screen.findByRole('heading', { level: 1, name: /Deep Learning/ })).toBeTruthy()
    await u.click(screen.getByRole('button', { name: 'Back to start' }))
    await u.click(screen.getByRole('button', { name: /Remove Deep Learning .* from recent/ }))
    expect(screen.queryByRole('region', { name: 'Recent quizzes' })).toBeNull()
  })
})

describe('address bar', () => {
  it('?sample=demo opens straight into the quiz, and progress is namespaced to it', async () => {
    stubFetch()
    go('/?sample=demo')
    const u = userEvent.setup()
    render(<App />)
    await screen.findByRole('heading', { level: 1, name: /Deep Learning/ })
    await u.click(screen.getByRole('button', { name: 'Check answer' }))
    const keys = Object.keys(localStorage)
    expect(keys.some((k) => k.startsWith('quiz:v1:sample:demo:attempts'))).toBe(true)
    expect(keys.every((k) => k.startsWith('quiz:v1:'))).toBe(true)
  })

  it('a GitHub link that has no manifest.json explains exactly what was tried', async () => {
    const calls = stubFetch()
    go('/?repo=octocat/quizzes&path=course-1/midterm&ref=dev')
    render(<App />)
    expect(await screen.findByText('This quiz could not be loaded')).toBeTruthy()
    expect(screen.getByText(/manifest\.json not found/)).toBeTruthy()
    expect(screen.getByText(/raw\.githubusercontent\.com\/octocat\/quizzes\/dev\/course-1\/midterm\/manifest\.json/)).toBeTruthy()
    expect(calls).toContain('https://raw.githubusercontent.com/octocat/quizzes/dev/course-1/midterm/manifest.json')
    const u = userEvent.setup()
    await u.click(screen.getByRole('button', { name: /Back to start/ }))
    expect(screen.getByRole('textbox', { name: 'GitHub folder URL' })).toBeTruthy()
    expect(window.location.search).toBe('')
  })

  it('loads a real GitHub-style folder through raw URLs, including its theme and reference', async () => {
    const files: Record<string, string> = {
      'octocat/quizzes/main/c/manifest.json': JSON.stringify({ title: 'Remote quiz', description: 'd', topics: ['t'], questions: ['q.json'], theme: { scheme: 'light', accent: '#cc3300' }, reference: 'ref.md' }),
      'octocat/quizzes/main/c/q.json': JSON.stringify([{ type: 'mcq', id: 'one', topic: 't', title: 'Remote question', prompt: '![x](./assets/a.png)', options: [{ text: 'yes', correct: true }, { text: 'no', correct: false }] }]),
      'octocat/quizzes/main/c/ref.md': '# Ref',
    }
    vi.stubGlobal('fetch', async (u: RequestInfo | URL) => {
      const m = /raw\.githubusercontent\.com\/(.+)$/.exec(String(u))
      return m && m[1] in files ? res(200, files[m[1]]) : res(404)
    })
    go('/?repo=octocat/quizzes&path=c')
    render(<App />)
    expect(await screen.findByRole('heading', { level: 1, name: 'Remote quiz' })).toBeTruthy()
    expect(document.documentElement.style.getPropertyValue('color-scheme')).toBe('light')
    expect(document.documentElement.style.getPropertyValue('--accent')).toBe('#cc3300')
    expect(document.querySelector('img')!.getAttribute('src')).toBe('https://raw.githubusercontent.com/octocat/quizzes/main/c/assets/a.png')
    expect(screen.getByRole('button', { name: 'Reference' })).toBeTruthy()
    expect((screen.getByRole('button', { name: 'Copy share link' }) as HTMLButtonElement).disabled).toBe(false)
  })

  it('an invalid link goes to the start screen with a message instead of crashing', () => {
    stubFetch()
    go('/?repo=nonsense')
    render(<App />)
    expect(screen.getByRole('alert').textContent).toContain('invalid link')
    expect(screen.getByRole('textbox', { name: 'GitHub folder URL' })).toBeTruthy()
  })

  it('moving between questions or exam screens (hash only) does not reopen the quiz, even though browsers fire popstate', async () => {
    const calls = stubFetch()
    go('/?sample=demo')
    const u = userEvent.setup()
    render(<App />)
    await screen.findByRole('heading', { level: 1, name: /Deep Learning/ })
    await u.click(screen.getByRole('tab', { name: 'Exam' }))
    // what Firefox/Chrome do on every fragment change
    await act(async () => void window.dispatchEvent(new PopStateEvent('popstate')))
    expect(screen.getByRole('heading', { name: 'Build an exam' })).toBeTruthy()
    await u.click(screen.getByRole('button', { name: /Start exam/ }))
    await act(async () => void window.dispatchEvent(new PopStateEvent('popstate')))
    expect(await screen.findByRole('timer')).toBeTruthy() // still running, not bounced back to the builder
    expect(calls.filter((c) => c.endsWith('manifest.json'))).toHaveLength(1)
  })

  it('the browser back button returns from a quiz to the start screen', async () => {
    stubFetch()
    const u = userEvent.setup()
    render(<App />)
    await u.click(screen.getByRole('button', { name: 'Try the sample quiz' }))
    await screen.findByRole('heading', { level: 1, name: /Deep Learning/ })
    window.history.back()
    await waitFor(() => expect(screen.getByRole('textbox', { name: 'GitHub folder URL' })).toBeTruthy())
  })
})

describe('local folder', () => {
  const file = (rel: string, body: string) => Object.assign(new File([body], rel.split('/').pop()!), { webkitRelativePath: `my-quiz/${rel}` })
  it('previews a picked folder: no share link, blob images, its own theme', async () => {
    stubFetch()
    const u = userEvent.setup()
    render(<App />)
    const manifest = { title: 'Local preview', description: 'd', topics: ['t'], questions: ['q.json'], theme: { accent: '#00aa55' } }
    const q = [{ type: 'mcq', id: 'one', topic: 't', title: 'Local question', prompt: '![pic](assets/pic.png)', options: [{ text: 'yes', correct: true }, { text: 'no', correct: false }] }]
    await u.upload(screen.getByLabelText('Choose a quiz folder'), [file('manifest.json', JSON.stringify(manifest)), file('q.json', JSON.stringify(q)), file('assets/pic.png', 'png')])
    expect(await screen.findByRole('heading', { level: 1, name: 'Local preview' })).toBeTruthy()
    expect(document.documentElement.style.getPropertyValue('--accent')).toBe('#00aa55')
    expect(document.querySelector('img')!.getAttribute('src')).toMatch(/^blob:/)
    expect((screen.getByRole('button', { name: 'Copy share link' }) as HTMLButtonElement).disabled).toBe(true)
    expect(screen.queryByRole('button', { name: /Reload/ })).toBeNull() // a webkitdirectory snapshot cannot be reloaded
    expect(window.location.search).toBe('')
  })

  it('tells you when the picked folder is one level too high', async () => {
    stubFetch()
    const u = userEvent.setup()
    render(<App />)
    await u.upload(screen.getByLabelText('Choose a quiz folder'), [file('course/manifest.json', '{}')])
    expect(await screen.findByText(/pick "course" instead/)).toBeTruthy()
  })
})

describe('local folder with a directory handle (Chromium)', () => {
  afterEach(() => delete (window as unknown as { showDirectoryPicker?: unknown }).showDirectoryPicker)

  it('reloads on demand and when you come back to the tab, without wiping a half-typed answer if nothing changed', async () => {
    stubFetch()
    const disk: Record<string, string> = {
      'manifest.json': JSON.stringify({ title: 'Live quiz', description: 'd', topics: ['t'], questions: ['q.json'] }),
      'q.json': JSON.stringify([{ type: 'calculation', id: 'c', topic: 't', title: 'Version one', prompt: 'p', parts: [{ id: 'x', value: 1 }] }]),
    }
    const dir = {
      kind: 'directory',
      name: 'live-quiz',
      values: async function* () {
        for (const [name, body] of Object.entries(disk)) yield { kind: 'file', name, getFile: async () => new File([body], name) }
      },
    }
    ;(window as unknown as { showDirectoryPicker: unknown }).showDirectoryPicker = async () => dir
    const u = userEvent.setup()
    render(<App />)
    await u.click(screen.getByRole('button', { name: 'Load local folder' }))
    expect(await screen.findByRole('heading', { name: 'Version one' })).toBeTruthy()

    await u.type(screen.getByRole('textbox'), '42')
    // back on the tab, nothing changed on disk: the typed answer must survive
    await act(async () => void fireEvent.focus(window))
    await waitFor(() => expect(screen.getByRole('button', { name: /Reload/ }).hasAttribute('disabled')).toBe(false))
    expect((screen.getByRole('textbox') as HTMLInputElement).value).toBe('42')

    // edit on disk, come back: the change appears
    disk['q.json'] = JSON.stringify([{ type: 'calculation', id: 'c', topic: 't', title: 'Version two', prompt: 'p', parts: [{ id: 'x', value: 1 }] }])
    await act(async () => void fireEvent.focus(window))
    expect(await screen.findByRole('heading', { name: 'Version two' })).toBeTruthy()

    // a syntax error while authoring is reported, and fixing it + the Reload button recovers
    disk['q.json'] = '[{nope'
    await u.click(screen.getByRole('button', { name: /Reload/ }))
    expect(await screen.findByText('This quiz could not be loaded')).toBeTruthy()
    disk['q.json'] = JSON.stringify([{ type: 'calculation', id: 'c', topic: 't', title: 'Version three', prompt: 'p', parts: [{ id: 'x', value: 1 }] }])
    await act(async () => void fireEvent.focus(window)) // fixing the file and returning to the tab is enough
    expect(await screen.findByRole('heading', { name: 'Version three' })).toBeTruthy()
  })

  it('cancelling the folder picker is not an error', async () => {
    stubFetch()
    ;(window as unknown as { showDirectoryPicker: unknown }).showDirectoryPicker = async () => {
      throw new DOMException('cancelled', 'AbortError')
    }
    const u = userEvent.setup()
    render(<App />)
    await u.click(screen.getByRole('button', { name: 'Load local folder' }))
    expect(screen.queryByRole('alert')).toBeNull()
  })
})
