import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const TEXT = /\.(json|jsonl|md|txt|csv)$/i

/** Reads a quiz folder into a path → text map (binary files become empty strings; only their existence matters). */
export function readFolder(root: string): Record<string, string> {
  const files: Record<string, string> = {}
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      if (name === '.git' || name === 'node_modules') continue
      const full = join(dir, name)
      if (statSync(full).isDirectory()) walk(full)
      else files[relative(root, full).split('\\').join('/')] = TEXT.test(name) ? readFileSync(full, 'utf8') : ''
    }
  }
  walk(root)
  return files
}

