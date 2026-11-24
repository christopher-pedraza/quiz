import { DndContext, MouseSensor, TouchSensor, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import { createContext, useCallback, useContext, useState, type ReactNode } from 'react'

/**
 * One interaction model for every "move a chip to a place" question (drag-and-drop blanks, categorize):
 *  - drag a chip onto a target, or
 *  - click / press Enter on a chip to select it, then click / press Enter on a target to place it.
 * The second path needs no pointer dragging, so it works with keyboards, screen readers, trackpads and touch.
 */
interface Board {
  selected: string | null
  select(id: string | null): void
  place(target: string): void
  disabled: boolean
}
const BoardContext = createContext<Board>({ selected: null, select() {}, place() {}, disabled: false })

export function ChipBoard({ onPlace, disabled = false, children }: { onPlace(chipId: string, targetId: string): void; disabled?: boolean; children: ReactNode }) {
  const [selected, setSelected] = useState<string | null>(null)
  const sensors = useSensors(useSensor(MouseSensor, { activationConstraint: { distance: 6 } }), useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 6 } }))
  const place = useCallback(
    (target: string) => {
      if (selected === null || disabled) return
      onPlace(selected, target)
      setSelected(null)
    },
    [selected, onPlace, disabled],
  )
  const onDragEnd = (e: DragEndEvent) => {
    if (e.over && !disabled) onPlace(String(e.active.id), String(e.over.id))
    setSelected(null)
  }
  return (
    <BoardContext.Provider value={{ selected, select: setSelected, place, disabled }}>
      <DndContext sensors={sensors} onDragEnd={onDragEnd}>
        {children}
      </DndContext>
      <div className="sr-only" aria-live="polite">
        {selected !== null ? 'Chip selected. Move to a drop area and press Enter to place it.' : ''}
      </div>
    </BoardContext.Provider>
  )
}

export function Chip({ id, children, className = '', code = false }: { id: string; children: ReactNode; className?: string; code?: boolean }) {
  const board = useContext(BoardContext)
  const { setNodeRef, listeners, transform, isDragging } = useDraggable({ id, disabled: board.disabled })
  return (
    <button
      type="button"
      ref={setNodeRef}
      {...listeners}
      className={`dnd-chip ${code ? 'code' : ''} ${isDragging ? 'dragging' : ''} ${className}`}
      aria-pressed={board.selected === id}
      disabled={board.disabled}
      style={transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`, position: 'relative', zIndex: 5 } : undefined}
      onClick={(e) => {
        e.stopPropagation()
        board.select(board.selected === id ? null : id)
      }}
    >
      {children}
    </button>
  )
}

export function Target({ id, children, className = '', label, as: Tag = 'div' }: { id: string; children?: ReactNode; className?: string; label: string; as?: 'div' | 'span' }) {
  const board = useContext(BoardContext)
  const { setNodeRef, isOver } = useDroppable({ id, disabled: board.disabled })
  return (
    <Tag
      ref={setNodeRef as never}
      role="group"
      tabIndex={board.disabled ? -1 : 0}
      aria-label={label}
      className={`${className} ${isOver ? 'drop-over' : ''}`}
      onClick={() => board.place(id)}
      onKeyDown={(e: React.KeyboardEvent) => {
        if ((e.key === 'Enter' || e.key === ' ') && e.target === e.currentTarget) {
          e.preventDefault()
          board.place(id)
        }
      }}
    >
      {children}
    </Tag>
  )
}
