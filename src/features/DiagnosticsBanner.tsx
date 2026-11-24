import type { Diagnostic } from '../core/model/types.ts'

export function DiagnosticList({ diagnostics }: { diagnostics: Diagnostic[] }) {
  return (
    <ul className="diag-list">
      {diagnostics.map((d, i) => (
        <li key={i}>
          <div className="diag-where">
            <span className={`chip ${d.severity === 'error' ? 'bad' : 'warn'}`}>{d.severity}</span>{' '}
            {[d.file, d.line !== undefined ? `line ${d.line}` : d.index !== undefined ? `item ${d.index}` : '', d.id ? `id ${d.id}` : '', d.path].filter(Boolean).join(' · ')}
          </div>
          <div>{d.message}</div>
          {d.hint && <div className="diag-hint">→ {d.hint}</div>}
        </li>
      ))}
    </ul>
  )
}

/** Authoring diagnostics for a quiz that did load: skipped questions and warnings. */
export function DiagnosticsBanner({ diagnostics, skipped }: { diagnostics: Diagnostic[]; skipped: number }) {
  if (diagnostics.length === 0) return null
  const errors = diagnostics.filter((d) => d.severity === 'error').length
  const warnings = diagnostics.length - errors
  const summary = [skipped > 0 && `${skipped} question${skipped === 1 ? '' : 's'} skipped`, errors > 0 && `${errors} error${errors === 1 ? '' : 's'}`, warnings > 0 && `${warnings} warning${warnings === 1 ? '' : 's'}`].filter(Boolean).join(' · ')
  return (
    <details className={`banner ${errors ? 'error' : 'warning'}`} style={{ margin: '0.75rem 1rem 0' }} open={errors > 0 && diagnostics.length <= 3}>
      <summary style={{ cursor: 'pointer' }}>
        <strong>Quiz problems:</strong> {summary}. Authors: click for details.
      </summary>
      <DiagnosticList diagnostics={diagnostics} />
    </details>
  )
}

/** The quiz could not be loaded at all. */
export function LoadError({ diagnostics, onBack, onRetry }: { diagnostics: Diagnostic[]; onBack(): void; onRetry?(): void }) {
  return (
    <div className="hub">
      <div className="banner error">
        <h2>This quiz could not be loaded</h2>
        <DiagnosticList diagnostics={diagnostics} />
      </div>
      <div className="row" style={{ marginTop: '1rem' }}>
        <button className="btn" onClick={onBack}>
          ← Back to start
        </button>
        {onRetry && (
          <button className="btn primary" onClick={onRetry}>
            Try again
          </button>
        )}
      </div>
    </div>
  )
}
