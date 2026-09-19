"use client";
import { cn } from "@/lib/utils";
import { AnimatePresence, motion, useDragControls } from "motion/react";
import { X } from "lucide-react";
import { useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";

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
 * Bottom sheet on phones, centered glass dialog on desktop.
 */
export function GlassSheet({ open, onClose, title, children, width = 560, footer }: Props) {
  const drag = useDragControls();
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    document.documentElement.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.documentElement.style.overflow = "";
    };
  }, [open, onClose]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-end sm:items-center sm:justify-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
        >
          <div className="absolute inset-0 bg-fg/20 backdrop-blur-[2px]" onClick={onClose} />
          <motion.div
            role="dialog"
            aria-modal
            className={cn(
              "glass-strong specular relative z-10 flex max-h-[92dvh] w-full flex-col overflow-hidden",
              "rounded-t-[var(--r-xl)] sm:rounded-[var(--r-xl)]",
            )}
            style={{ maxWidth: `min(100%, ${width}px)` }}
            initial={{ y: 48, scale: 0.98, opacity: 0 }}
            animate={{ y: 0, scale: 1, opacity: 1 }}
            exit={{ y: 48, scale: 0.98, opacity: 0 }}
            transition={{ type: "spring", stiffness: 420, damping: 38 }}
            drag="y"
            dragListener={false}
            dragControls={drag}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.4 }}
            onDragEnd={(_, info) => {
              if (info.offset.y > 120 || info.velocity.y > 800) onClose();
            }}
          >
            <div className="cursor-grab touch-none py-2 sm:hidden" onPointerDown={(e) => drag.start(e)}>
              <div className="mx-auto h-1.5 w-10 rounded-full bg-fg/15" />
            </div>
            <div className="flex items-center justify-between px-5 pt-1 pb-1 sm:pt-5">
              <h2 className="text-[19px] font-semibold tracking-tight">{title}</h2>
              <button
                onClick={onClose}
                aria-label="Close"
                className="pressable grid h-8 w-8 place-items-center rounded-full bg-fg/6 text-fg-2 hover:bg-fg/10"
              >
                <X size={16} strokeWidth={2.2} />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-4">{children}</div>
            {footer && <div className="border-t border-[var(--glass-border-2)] px-5 py-3 safe-bottom">{footer}</div>}
            {!footer && <div className="safe-bottom" />}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
