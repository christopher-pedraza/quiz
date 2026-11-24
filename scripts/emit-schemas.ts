// Writes src/core/schema/schemas.ts to public/schema/*.json. Run via `npm run schemas`.
import { mkdirSync, writeFileSync } from 'node:fs'
import { emittedSchemas } from '../src/core/schema/schemas.ts'

const dir = new URL('../public/schema/', import.meta.url)
mkdirSync(dir, { recursive: true })
for (const [name, schema] of Object.entries(emittedSchemas)) {
  writeFileSync(new URL(name, dir), JSON.stringify(schema, null, 2) + '\n')
}
console.log(`wrote ${Object.keys(emittedSchemas).length} schemas to public/schema/`)
