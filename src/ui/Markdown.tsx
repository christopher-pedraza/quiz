import { createContext, useContext, useMemo } from 'react'
import { renderMarkdown } from '../core/content/render.ts'
import type { QuizSource } from '../core/source/types.ts'

/** Lets every <Markdown> resolve relative images against the quiz being shown, without prop drilling. */
export const SourceContext = createContext<QuizSource | undefined>(undefined)

export function useRenderedHtml(text: string, inline = false): string {
  const source = useContext(SourceContext)
  return useMemo(() => renderMarkdown(text, { source, inline }), [text, source, inline])
}

export function Markdown({ text, inline = false, className = '' }: { text: string; inline?: boolean; className?: string }) {
  const html = useRenderedHtml(text, inline)
  return inline ? (
    <span className={`md md-inline ${className}`} dangerouslySetInnerHTML={{ __html: html }} />
  ) : (
    <div className={`md ${className}`} dangerouslySetInnerHTML={{ __html: html }} />
  )
}
