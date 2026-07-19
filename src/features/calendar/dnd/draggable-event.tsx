import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { useDragDrop } from "@/features/calendar/contexts/dnd-context";
import type { ICalendarEvent } from "@/features/calendar/interfaces";

interface DraggableEventProps {
  event: ICalendarEvent;
  children: ReactNode;
  className?: string;
}

/** Makes an appointment chip draggable onto any droppable slot. Cancelled
 * appointments are pinned in place — moving one is never what staff meant. */
export function DraggableEvent({
  event,
  children,
  className,
}: DraggableEventProps) {
  const { startDrag, endDrag, draggedEvent } = useDragDrop();
  const isDragged = draggedEvent?.id === event.id;
  const locked = event.status === "cancelled";

  return (
    <div
      className={cn(
        className,
        locked ? "cursor-default" : "cursor-grab",
        isDragged && "cursor-grabbing opacity-50",
      )}
      draggable={!locked}
      onDragStart={(e) => {
        e.dataTransfer.setData("text/plain", String(event.id));
        e.dataTransfer.effectAllowed = "move";
        startDrag(event);
      }}
      onDragEnd={endDrag}
    >
      {children}
    </div>
  );
}
