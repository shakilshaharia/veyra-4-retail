import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/format';

export type DragHandleProps = ReturnType<typeof useSortable>['listeners'] & ReturnType<typeof useSortable>['attributes'];

function SortableRow({ id, children }: { id: string; children: (handle: ReactNode, dragging: boolean) => ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const handle = (
    <button
      type="button"
      className="inline-flex size-8 shrink-0 cursor-grab touch-none items-center justify-center rounded-md text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 active:cursor-grabbing"
      aria-label="Drag to reorder (or press space, then use the arrow keys)"
      {...attributes}
      {...listeners}
    >
      <GripVertical className="size-4" aria-hidden="true" />
    </button>
  );
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn('relative', isDragging && 'z-10 opacity-90 shadow-lg')}
    >
      {children(handle, isDragging)}
    </li>
  );
}

// Reorder with a mouse, a finger, or the keyboard (space to lift, arrows to
// move, space to drop).
export function SortableList<T>({
  items,
  getId,
  onReorder,
  renderItem,
  className,
}: {
  items: T[];
  getId: (item: T) => string;
  onReorder: (next: T[]) => void;
  renderItem: (item: T, handle: ReactNode, index: number, dragging: boolean) => ReactNode;
  className?: string;
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const ids = items.map(getId);
  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    onReorder(arrayMove(items, ids.indexOf(String(active.id)), ids.indexOf(String(over.id))));
  };
  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        <ul className={className}>
          {items.map((item, index) => (
            <SortableRow key={ids[index]} id={ids[index]}>
              {(handle, dragging) => renderItem(item, handle, index, dragging)}
            </SortableRow>
          ))}
        </ul>
      </SortableContext>
    </DndContext>
  );
}

// Up/down buttons as an alternative to dragging.
export function move<T>(items: T[], index: number, delta: -1 | 1) {
  const target = index + delta;
  if (target < 0 || target >= items.length) return items;
  return arrayMove(items, index, target);
}
