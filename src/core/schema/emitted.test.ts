import { join } from 'node:path'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { emittedSchemas } from './schemas.ts'

describe('public/schema/*.json', () => {
  it.each(Object.keys(emittedSchemas))('%s is in sync with schemas.ts (run `npm run schemas`)', (name) => {
    const onDisk = JSON.parse(readFileSync(join(process.cwd(), 'public/schema', name), 'utf8'))
    expect(onDisk).toEqual(JSON.parse(JSON.stringify(emittedSchemas[name])))
  })
})
