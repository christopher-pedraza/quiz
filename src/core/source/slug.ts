import type { GithubSpec } from './types.ts'
import { trimSlashes } from './paths.ts'

/** Deterministic storage namespace. Owner and repo are case-insensitive on GitHub; ref and path are not. */
export function githubSlug(s: Pick<GithubSpec, 'owner' | 'repo' | 'ref' | 'path'>): string {
  return `gh:${s.owner.toLowerCase()}/${s.repo.toLowerCase()}@${s.ref}#${trimSlashes(s.path)}`
}
export const localSlug = (folderName: string) => `local:${folderName}`
export const sampleSlug = (name: string) => `sample:${name}`
