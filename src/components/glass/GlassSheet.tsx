"use client";
import type { ReactNode } from "react";
import { Sheet } from "@/components/ui/Sheet";

type Props = {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  /** desktop max width */
  width?: number;
  footer?: ReactNode;
};

/**
 * v1 API kept for existing callers — a thin wrapper around `@/components/ui/Sheet`
 * (bottom sheet on phones, centered dialog on desktop, focus trap, swipe to dismiss).
 * New code should use `Sheet` directly for the iOS header (cancel/done), sizes and snap points.
 */
export function GlassSheet({ open, onClose, title, children, width = 560, footer }: Props) {
  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()} title={title} width={width} footer={footer}>
      {children}
    </Sheet>
  );
}
