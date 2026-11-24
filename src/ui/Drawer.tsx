import { useEffect, useRef, type ReactNode } from 'react'

interface Props {
  title: string
  onClose(): void
  children: ReactNode
  /** 'right' slide-over (default) or a centered dialog. */
  variant?: 'right' | 'center'
  footer?: ReactNode
  /** Element to focus on open; defaults to the first focusable element. */
  initialFocus?: string
}

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

/** Modal slide-over or dialog: Esc and scrim click close it, Tab stays inside, focus returns to the opener. */
export function Drawer({ title, onClose, children, variant = 'right', footer, initialFocus }: Props) {
  const panel = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null
    const el = panel.current!
    const first = (initialFocus && el.querySelector<HTMLElement>(initialFocus)) || el.querySelector<HTMLElement>('[data-autofocus]') || el.querySelectorAll<HTMLElement>(FOCUSABLE)[1]
    first?.focus()
    return () => opener?.focus?.()
  }, [initialFocus])
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.stopPropagation()
      onClose()
    } else if (e.key === 'Tab') {
      const items = Array.from(panel.current!.querySelectorAll<HTMLElement>(FOCUSABLE))
      if (items.length === 0) return
      const [a, z] = [items[0], items[items.length - 1]]
      if (e.shiftKey && document.activeElement === a) (e.preventDefault(), z.focus())
      else if (!e.shiftKey && document.activeElement === z) (e.preventDefault(), a.focus())
    }
  }
  const Panel = variant === 'right' ? 'drawer' : 'dialog'
  return (
    <div className={`scrim ${variant}`} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={panel} className={Panel} role="dialog" aria-modal="true" aria-label={title} onKeyDown={onKeyDown}>
        <div className={variant === 'right' ? 'drawer-head' : 'row'} style={variant === 'center' ? { marginBottom: '0.75rem' } : undefined}>
          <h2 style={variant === 'center' ? { margin: 0, flex: 1 } : undefined}>{title}</h2>
          <button className="btn ghost icon-btn" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        {variant === 'right' ? <div className="drawer-body">{children}</div> : children}
        {footer}
      </div>
    </div>
  )
}

export function ConfirmDialog(props: { title: string; children: ReactNode; confirmLabel: string; cancelLabel?: string; danger?: boolean; onConfirm(): void; onCancel(): void }) {
  return (
    <Drawer title={props.title} variant="center" onClose={props.onCancel}>
      <div className="stack">
        <div>{props.children}</div>
        <div className="row" style={{ justifyContent: 'flex-end' }}>
          <button className="btn" onClick={props.onCancel}>
            {props.cancelLabel ?? 'Cancel'}
          </button>
          <button className="btn primary" data-autofocus onClick={props.onConfirm}>
            {props.confirmLabel}
          </button>
        </div>
      </div>
    </Drawer>
  )
}
