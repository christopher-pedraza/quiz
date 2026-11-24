// Validates a quiz folder exactly like the app does on load.   npm run validate -- path/to/quiz-folder
import { loadQuiz } from '../src/core/load/loadQuiz.ts'
import { MemorySource } from '../src/core/source/memory.ts'
import { readFolder } from './folder.ts'

const dir = process.argv[2]
if (!dir) {
  console.error('usage: npm run validate -- <quiz-folder>')
  process.exit(2)
}
const result = await loadQuiz(new MemorySource(readFolder(dir)))
const diagnostics = result.ok ? result.quiz.diagnostics : result.diagnostics
for (const d of diagnostics) {
  const where = [d.file, d.line !== undefined ? `line ${d.line}` : d.index !== undefined ? `#${d.index}` : '', d.id ? `(${d.id})` : '', d.path].filter(Boolean).join(' ')
  console.log(`${d.severity === 'error' ? 'ERROR  ' : 'warning'} ${where}: ${d.message}${d.hint ? `\n         → ${d.hint}` : ''}`)
}
const errors = diagnostics.filter((d) => d.severity === 'error').length
if (result.ok) console.log(`\n"${result.quiz.manifest.title}": ${result.quiz.questions.length} valid question(s), ${result.quiz.skipped} skipped, ${diagnostics.length - errors} warning(s)`)
else console.log('\nthe quiz cannot be loaded')
process.exit(result.ok && errors === 0 ? 0 : 1)
