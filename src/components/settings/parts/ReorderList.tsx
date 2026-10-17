"use client";
import { Reorder, useDragControls } from "motion/react";
import { GripVertical } from "lucide-react";
import { useState, type KeyboardEvent, type ReactNode } from "react";
import { cn } from "@/lib/utils";

export type ReorderRowContext = {
  /** The drag handle (also keyboard-operable: ↑/↓ while focused). Place it in the row. */
  handle: ReactNode;
  index: number;
  count: number;
};

export type ReorderListProps<T> = {
  items: T[];
  getId: (item: T) => string;
  /** Accessible name of an item (for the handle: "Reorder Football"). */
  getLabel: (item: T) => string;
  /** Commit a new order. Return a promise to keep the optimistic order until it settles. */
  onReorder: (ids: string[]) => unknown;
  renderItem: (item: T, ctx: ReorderRowContext) => ReactNode;
  className?: string;
  "aria-label"?: string;
};

/**
 * Inset-grouped list whose rows reorder by dragging a handle (pointer/touch, via motion's
 * `Reorder`) or with the arrow keys on the focused handle. Only the handle starts a drag, so rows
 * stay scrollable and tappable.
 */
export function ReorderList<T>({ items, getId, getLabel, onReorder, renderItem, className, ...aria }: ReorderListProps<T>) {
  const ids = items.map(getId);
  const [draft, setDraft] = useState<string[] | null>(null);
  const [pending, setPending] = useState<string[] | null>(null);
  // Drop drafts that reference rows which no longer exist (deleted meanwhile).
  const valid = (order: string[] | null) => (order && order.length === ids.length && order.every((id) => ids.includes(id)) ? order : null);
  const order = valid(draft) ?? valid(pending) ?? ids;
  const byId = new Map(items.map((it) => [getId(it), it]));

  const commit = (next: string[]) => {
    setDraft(null);
    if (next.join() === ids.join()) return;
    setPending(next);
    Promise.resolve(onReorder(next))
      .catch(() => {})
      .finally(() => setPending(null));
  };

  const move = (id: string, delta: number) => {
    const from = order.indexOf(id);
    const to = from + delta;
    if (from < 0 || to < 0 || to >= order.length) return;
    const next = [...order];
    next.splice(to, 0, next.splice(from, 1)[0]!);
    commit(next);
  };

  return (
    <Reorder.Group as="ul" axis="y" values={order} onReorder={setDraft} aria-label={aria["aria-label"]} className={cn("surface relative overflow-hidden rounded-lg", className)}>
      {order.map((id, index) => {
        const item = byId.get(id);
        if (!item) return null;
        return (
          <Row key={id} value={id} label={getLabel(item)} onDrop={() => commit(order)} onMove={(d) => move(id, d)}>
            {(handle) => renderItem(item, { handle, index, count: order.length })}
          </Row>
        );
      })}
    </Reorder.Group>
  );
}

function Row({ value, label, onDrop, onMove, children }: { value: string; label: string; onDrop: () => void; onMove: (delta: number) => void; children: (handle: ReactNode) => ReactNode }) {
  const controls = useDragControls();
  const [dragging, setDragging] = useState(false);

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === "ArrowUp" || e.key === "ArrowDown") {
      e.preventDefault();
      onMove(e.key === "ArrowUp" ? -1 : 1);
    }
  };

  const handle = (
    <button
      type="button"
      aria-label={`Reorder ${label}`}
      aria-roledescription="drag handle — use the up and down arrow keys to move"
      onPointerDown={(e) => {
        e.preventDefault();
        controls.start(e);
      }}
      onKeyDown={onKeyDown}
      className="hit-44 grid size-8 shrink-0 cursor-grab touch-none place-items-center rounded-xs text-fg-4 outline-offset-0 hover:text-fg-3 active:cursor-grabbing"
    >
      <GripVertical size={18} aria-hidden />
    </button>
  );

  return (
    <Reorder.Item
      as="li"
      value={value}
      dragListener={false}
      dragControls={controls}
      onDragStart={() => setDragging(true)}
      onDragEnd={() => {
        setDragging(false);
        onDrop();
      }}
      className={cn(
        "relative select-none",
        "after:absolute after:right-0 after:bottom-0 after:left-[58px] after:h-[0.5px] after:bg-separator last:after:hidden",
        dragging && "z-10 rounded-sm bg-surface-solid shadow-e3 after:hidden",
      )}
    >
      {children(handle)}
    </Reorder.Item>
  );
}
