import { describe, expect, it, vi } from 'vitest'
import { resolveRelative } from './paths.ts'
import { parseSourceInput } from './parse.ts'
import { githubSlug, localSlug } from './slug.ts'
import { GitHubSource } from './github.ts'
import { LocalFolderSource } from './local.ts'
import { BundledSource } from './bundled.ts'
import { SourceError } from './types.ts'

describe('resolveRelative', () => {
  it.each([
    ['./assets/a.png', 'assets/a.png', ''],
    ['assets//a.png', 'assets/a.png', ''],
    ['/assets/a.png', 'assets/a.png', ''],
    ['a/../b.png', 'b.png', ''],
    ['a b.png?x=1#h', 'a b.png', '?x=1#h'],
    ['img\\a.png', 'img/a.png', ''],
  ])('%s', (raw, path, suffix) => expect(resolveRelative(raw)).toEqual({ kind: 'path', path, suffix }))
  it.each(['../secret.png', 'a/../../x', '%2e%2e/x', '..\\x', '.', ''])('rejects traversal %j', (raw) => expect(resolveRelative(raw)).toEqual({ kind: 'escape' }))
  it.each(['https://x.com/a.png', 'data:image/png;base64,xx', '//cdn/x.png', 'mailto:a@b.c', 'javascript:alert(1)'])('leaves %j alone', (raw) =>
    expect(resolveRelative(raw)).toEqual({ kind: 'external' }))
  it('fragments', () => expect(resolveRelative('#top')).toEqual({ kind: 'fragment' }))
})

describe('parseSourceInput', () => {
  const g = (owner: string, repo: string, ref: string, path: string) => ({ spec: { kind: 'github', owner, repo, ref, path } })
  it.each([
    ['octocat/quizzes', g('octocat', 'quizzes', 'main', '')],
    ['octocat/quizzes/course-1/midterm', g('octocat', 'quizzes', 'main', 'course-1/midterm')],
    ['octocat/quizzes@dev/course-1', g('octocat', 'quizzes', 'dev', 'course-1')],
    ['https://github.com/octocat/quizzes', g('octocat', 'quizzes', 'main', '')],
    ['https://github.com/octocat/quizzes.git', g('octocat', 'quizzes', 'main', '')],
    ['https://github.com/octocat/quizzes/tree/v2/course-1/midterm/', g('octocat', 'quizzes', 'v2', 'course-1/midterm')],
    ['https://github.com/octocat/quizzes/blob/main/course-1/manifest.json', g('octocat', 'quizzes', 'main', 'course-1')],
    ['github.com/octocat/quizzes/tree/main', g('octocat', 'quizzes', 'main', '')],
    ['https://raw.githubusercontent.com/octocat/quizzes/main/c/manifest.json', g('octocat', 'quizzes', 'main', 'c')],
    ['https://raw.githubusercontent.com/octocat/quizzes/refs/heads/dev/c', g('octocat', 'quizzes', 'dev', 'c')],
  ])('%s', (input, expected) => expect(parseSourceInput(input)).toEqual(expected))
  it.each(['', 'justonepart', 'https://gitlab.com/a/b', 'https://github.com/a', 'https://github.com/a/b/issues/3', 'bad owner!/repo', 'a/b/../c'])(
    'rejects %j', (input) => expect(parseSourceInput(input)).toHaveProperty('error'))
})

describe('slugs', () => {
  it('lowercases owner and repo but not ref or path', () => {
    expect(githubSlug({ owner: 'OctoCat', repo: 'Quizzes', ref: 'Main', path: '/Course-1/' })).toBe('gh:octocat/quizzes@Main#Course-1')
    expect(githubSlug({ owner: 'a', repo: 'b', ref: 'feature/x', path: '' })).toBe('gh:a/b@feature/x#')
    expect(localSlug('my quiz')).toBe('local:my quiz')
  })
  it('different refs or paths never collide', () => {
    const s = (ref: string, path: string) => githubSlug({ owner: 'a', repo: 'b', ref, path })
    expect(new Set([s('main', 'x'), s('dev', 'x'), s('main', 'y'), s('main', '')]).size).toBe(4)
  })
})

const res = (status: number, body = '') => ({ ok: status >= 200 && status < 300, status, text: async () => body }) as Response

describe('GitHubSource', () => {
  const spec = { owner: 'o', repo: 'r', ref: 'main', path: 'course 1/mid' }
  it('builds raw URLs with encoded segments', () => {
    const s = new GitHubSource(spec, vi.fn())
    expect(s.urlFor('assets/a b.png')).toBe('https://raw.githubusercontent.com/o/r/main/course%201/mid/assets/a%20b.png')
    expect(s.label).toBe('o/r@main/course 1/mid')
  })
  it('reads text, and distinguishes 404, other HTTP errors and network failures', async () => {
    const f = vi.fn<typeof fetch>()
    const s = new GitHubSource(spec, f)
    f.mockResolvedValueOnce(res(200, 'hi'))
    expect(await s.readText('manifest.json')).toBe('hi')
    f.mockResolvedValueOnce(res(404))
    await expect(s.readText('x.json')).rejects.toMatchObject({ kind: 'not-found', status: 404 })
    f.mockResolvedValueOnce(res(429))
    await expect(s.readText('x.json')).rejects.toMatchObject({ kind: 'http', status: 429 })
    f.mockRejectedValueOnce(new TypeError('Failed to fetch'))
    await expect(s.readText('x.json')).rejects.toMatchObject({ kind: 'network' })
  })
  it('falls back to refs/heads/ for refs containing a slash, then remembers what worked', async () => {
    const f = vi.fn<typeof fetch>(async (u) => (String(u).includes('/refs/heads/feature/x/') ? res(200, 'ok') : res(404)))
    const s = new GitHubSource({ owner: 'o', repo: 'r', ref: 'feature/x', path: '' }, f)
    expect(await s.readText('manifest.json')).toBe('ok')
    expect(f).toHaveBeenCalledTimes(2)
    expect(s.assetUrl('a.png')).toContain('/refs/heads/feature/x/a.png')
    await s.readText('q.json')
    expect(f).toHaveBeenCalledTimes(3)
  })
  it('does not try fallbacks for plain refs or SHAs', async () => {
    const f = vi.fn<typeof fetch>(async () => res(404))
    await expect(new GitHubSource({ ...spec, ref: 'abc1234' }, f).readText('m.json')).rejects.toBeInstanceOf(SourceError)
    expect(f).toHaveBeenCalledTimes(1)
  })
})

describe('LocalFolderSource', () => {
  const file = (rel: string, body = '') => Object.assign(new File([body], rel.split('/').pop()!), { webkitRelativePath: rel })
  it('strips the picked folder name and skips junk', async () => {
    const s = LocalFolderSource.fromFileList([file('quiz/manifest.json', '{"a":1}'), file('quiz/assets/a.png', 'x'), file('quiz/.git/config'), file('quiz/node_modules/x/y.js')])
    expect(s.folderName).toBe('quiz')
    expect(s.slug).toBe('local:quiz')
    expect(s.has('manifest.json')).toBe(true)
    expect(s.has('.git/config')).toBe(false)
    expect(await s.readText('manifest.json')).toBe('{"a":1}')
    await expect(s.readText('nope.json')).rejects.toMatchObject({ kind: 'not-found' })
  })
  it('hands out blob URLs once per asset and revokes them', () => {
    const s = LocalFolderSource.fromFileList([file('quiz/assets/a.png', 'x')])
    const u = s.assetUrl('assets/a.png')
    expect(u).toMatch(/^blob:/)
    expect(s.assetUrl('assets/a.png')).toBe(u)
    expect(s.assetUrl('assets/missing.png')).toBe('assets/missing.png')
    s.dispose()
    expect(s.assetUrl('assets/a.png')).not.toBe(u)
  })
  it('suggests the inner folder when the picked folder is one level too high', () => {
    expect(LocalFolderSource.fromFileList([file('repo/course/manifest.json')]).suggestManifestFolder()).toBe('course')
    expect(LocalFolderSource.fromFileList([file('repo/manifest.json')]).suggestManifestFolder()).toBeUndefined()
    expect(LocalFolderSource.fromFileList([file('repo/a/manifest.json'), file('repo/b/manifest.json')]).suggestManifestFolder()).toBeUndefined()
  })
  it('reloads from a directory handle and sees edited files', async () => {
    let body = 'v1'
    const fileHandle = { kind: 'file', name: 'manifest.json', getFile: async () => new File([body], 'manifest.json') }
    const dir = { kind: 'directory', name: 'quiz', values: async function* () { yield fileHandle } } as unknown as FileSystemDirectoryHandle
    const s = await LocalFolderSource.fromDirectoryHandle(dir)
    expect(s.canReload).toBe(true)
    expect(await s.readText('manifest.json')).toBe('v1')
    body = 'v2'
    expect(await (await s.reload()).readText('manifest.json')).toBe('v2')
    await expect(LocalFolderSource.fromFileList([]).reload()).rejects.toThrow()
  })
})

describe('BundledSource', () => {
  it('reads from its base URL', async () => {
    const f = vi.fn<typeof fetch>(async () => res(200, 'x'))
    const s = new BundledSource('demo', './samples/demo/', f)
    expect(s.slug).toBe('sample:demo')
    expect(await s.readText('manifest.json')).toBe('x')
    expect(f).toHaveBeenCalledWith('./samples/demo/manifest.json')
    expect(s.assetUrl('assets/a b.png')).toBe('./samples/demo/assets/a%20b.png')
  })
})
