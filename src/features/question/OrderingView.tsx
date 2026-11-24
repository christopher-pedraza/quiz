import { closestCenter, DndContext, KeyboardSensor, MouseSensor, TouchSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { OrderingInstance } from '../../core/question-types/ordering.ts'
import { Markdown } from '../../ui/Markdown.tsx'
import type { ViewProps } from './types.ts'

type Props = ViewProps<OrderingInstance, { type: 'ordering'; order: number[] }>

function Row({ id, text, code, state, position, count, locked, onMove }: { id: string; text: string; code: boolean; state: string; position: number; count: number; locked: boolean; onMove(delta: number): void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id, disabled: locked })
  return (
    <li ref={setNodeRef} className={`ord-item ${state} ${isDragging ? 'dragging' : ''}`} style={{ transform: CSS.Transform.toString(transform), transition }}>
      <button type="button" className="handle" aria-label={`Drag "${text.trim()}". Press space, then the arrow keys to move.`} disabled={locked} {...attributes} {...listeners}>
        ⠿
      </button>
      <span className="muted" aria-hidden>
        {position + 1}.
      </span>
      <span className={`txt ${code ? 'code' : ''}`}>{code ? text : <Markdown text={text} inline />}</span>
      <button type="button" className="btn small icon-btn" aria-label={`Move "${text.trim()}" up`} disabled={locked || position === 0} onClick={() => onMove(-1)}>
        ↑
      </button>
      <button type="button" className="btn small icon-btn" aria-label={`Move "${text.trim()}" down`} disabled={locked || position === count - 1} onClick={() => onMove(1)}>
        ↓
      </button>
    </li>
  )
}

export function OrderingView({ inst, answer, onChange, locked, result }: Props) {
  const q = inst.question
  const sensors = useSensors(useSensor(MouseSensor, { activationConstraint: { distance: 4 } }), useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 6 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }))
  const order = answer.order
  const inPlace = (result?.detail.inPlace ?? []) as boolean[]
  const move = (from: number, to: number) => onChange({ ...answer, order: arrayMove(order, from, to) })
  const onDragEnd = (e: DragEndEvent) => {
    if (!e.over || e.active.id === e.over.id) return
    move(order.indexOf(Number(e.active.id)), order.indexOf(Number(e.over.id)))
  }
  const wrong = result !== undefined && !result.correct
  return (
    <div>
      <p className="muted" style={{ margin: '0 0 0.5rem' }}>
        Drag the items (or use the arrows) into the correct order.
      </p>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={order.map(String)} strategy={verticalListSortingStrategy}>
          <ol className="ord-list">
            {order.map((orig, pos) => (
              <Row key={orig} id={String(orig)} text={q.items[orig]} code={Boolean(q.language)} state={result ? (inPlace[pos] ? 'ok' : 'bad') : ''} position={pos} count={order.length} locked={locked} onMove={(d) => move(pos, pos + d)} />
            ))}
          </ol>
        </SortableContext>
      </DndContext>
      {wrong && (
        <div className="explanation">
          <strong>Correct order</strong>
          <ol style={{ margin: '0.4rem 0 0', paddingLeft: '1.4rem' }}>
            {q.items.map((t, i) => (
              <li key={i} className={q.language ? 'code' : ''} style={q.language ? { fontFamily: 'var(--font-mono)', whiteSpace: 'pre' } : undefined}>
                {t}
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  )
}
