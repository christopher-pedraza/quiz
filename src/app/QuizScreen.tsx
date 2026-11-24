import type { LoadedQuiz } from '../core/load/loadQuiz.ts'
import type { SourceSpec } from '../core/source/types.ts'
import type { ExamPreset } from '../core/share/preset.ts'
import type { KV } from '../core/storage/store.ts'
import { QuizProvider } from './QuizContext.tsx'
import { QuizShell } from './QuizShell.tsx'

interface Props {
  quiz: LoadedQuiz
  spec?: SourceSpec
  preset?: ExamPreset
  kv: KV
  onHome(): void
  onReload?: () => void
  reloading: boolean
}

/** Everything that needs Markdown/KaTeX/highlighting/dnd lives behind this one lazily loaded module. */
export default function QuizScreen({ quiz, spec, preset, kv, onHome, onReload, reloading }: Props) {
  return (
    <QuizProvider key={quiz.source.slug} quiz={quiz} spec={spec} kv={kv}>
      <QuizShell preset={preset} onHome={onHome} onReload={onReload} reloading={reloading} />
    </QuizProvider>
  )
}
