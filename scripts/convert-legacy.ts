// Converts the legacy neural-networks-pa-practice data folder to a quiz-platform folder.
//   node scripts/convert-legacy.ts <legacy-repo> <out-dir> [--only a,b] [--title "..."] [--language python]
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import { loadQuiz } from '../src/core/load/loadQuiz.ts'
import { MemorySource } from '../src/core/source/memory.ts'
import { convertQuestion, inlineCode, type ConvertContext } from './legacy.ts'

const args = process.argv.slice(2)
const flag = (name: string) => {
  const i = args.indexOf(`--${name}`)
  return i === -1 ? undefined : args.splice(i, 2)[1]
}
const only = flag('only')?.split(',')
const title = flag('title') ?? 'Neural Networks Practice'
const language = flag('language') ?? 'python'
const [legacy, out] = args
if (!legacy || !out) {
  console.error('usage: node scripts/convert-legacy.ts <legacy-repo> <out-dir> [--only a,b] [--title "..."] [--language python]')
  process.exit(2)
}

const data = join(legacy, 'public/data')
const manifestIn = JSON.parse(readFileSync(join(data, 'manifest.json'), 'utf8')) as { questionFiles: string[]; reference: string }
const ctx: ConvertContext = { language, topicIds: new Map() }
const files: Record<string, string> = {}
const questionFiles: string[] = []
const dropped: Record<string, number> = {}
let total = 0

for (const f of manifestIn.questionFiles) {
  const name = basename(f).replace(/\.jsonl?$/, '')
  if (only && !only.includes(name)) continue
  const lines = readFileSync(join(data, f), 'utf8').split('\n').filter((l) => l.trim())
  const converted: unknown[] = []
  for (const l of lines) {
    const r = convertQuestion(JSON.parse(l), ctx)
    for (const n of r.notes) dropped[n] = (dropped[n] ?? 0) + 1
    if (r.question) converted.push(inlineCode(r.question, language))
    else console.error(`! ${l.slice(0, 80)}: ${r.notes.join('; ')}`)
  }
  total += converted.length
  const outName = `questions/${name}.json`
  files[outName] = JSON.stringify(converted, null, 2) + '\n'
  questionFiles.push(outName)
}

const referenceIn = JSON.parse(readFileSync(join(data, manifestIn.reference), 'utf8')) as { entries: { name: string }[] }
files['reference.json'] = JSON.stringify({ entries: referenceIn.entries }, null, 2) + '\n'
files['manifest.json'] =
  JSON.stringify(
    {
      $schema: '../../schema/manifest.schema.json',
      schemaVersion: 1,
      title,
      description: 'Converted from the legacy neural-networks-pa-practice question bank.',
      topics: [...ctx.topicIds].map(([category, id]) => ({ id, title: category })),
      questions: questionFiles,
      reference: 'reference.json',
    },
    null,
    2,
  ) + '\n'

mkdirSync(join(out, 'questions'), { recursive: true })
for (const [p, text] of Object.entries(files)) writeFileSync(join(out, p), text)

const result = await loadQuiz(new MemorySource(files))
console.log(`converted ${total} questions from ${questionFiles.length} files into ${out}`)
for (const [n, c] of Object.entries(dropped)) console.log(`  ${n}: ${c}`)
const diagnostics = result.ok ? result.quiz.diagnostics : result.diagnostics
const errors = diagnostics.filter((d) => d.severity === 'error')
console.log(`validation: ${result.ok ? result.quiz.questions.length : 0} valid, ${errors.length} error(s), ${diagnostics.length - errors.length} warning(s)`)
for (const d of diagnostics.slice(0, 25)) console.log(`  ${d.severity} ${d.file ?? ''}${d.line ? ':' + d.line : ''}${d.index !== undefined ? '#' + d.index : ''} ${d.id ?? ''} ${d.path ?? ''} ${d.message}${d.hint ? ' (' + d.hint + ')' : ''}`)
if (diagnostics.length > 25) console.log(`  … and ${diagnostics.length - 25} more`)
process.exit(errors.length ? 1 : 0)
