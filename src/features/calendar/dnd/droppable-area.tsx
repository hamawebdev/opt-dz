import { useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { useDragDrop } from "@/features/calendar/contexts/dnd-context";

interface DroppableAreaProps {
  date: Date;
  /** Omitted in the month grid, where a drop keeps the original time of day. */
  hour?: number;
  minute?: number;
  children?: ReactNode;
  className?: string;
}

/** A slot an appointment can be dropped onto. Highlights while a chip hovers
 * over it so the target is unmistakable. */
export function DroppableArea({
  date,
  hour,
  minute,
  children,
  className,
}: DroppableAreaProps) {
  const { handleEventDrop, isDragging } = useDragDrop();
  const [isOver, setIsOver] = useState(false);

  return (
    <div
      className={cn(className, isOver && "bg-primary/15 ring-primary/40 ring-1")}
      onDragOver={(e) => {
        if (!isDragging) return;
        // Required for the drop event to fire at all.
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        setIsOver(true);
      }}
      onDragLeave={() => setIsOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setIsOver(false);
        handleEventDrop(date, hour, minute);
      }}
    >
      {children}
    </div>
  );
}
