"use client";
import { AlertDialog } from "@base-ui/react/alert-dialog";
import { Drawer } from "@base-ui/react/drawer";
import { useRef, useState } from "react";
import { useIsPhone } from "@/lib/media";
import { cn } from "@/lib/utils";
import { confirmStore, useConfirmQueue, type ConfirmOptions, type ConfirmRequest } from "./confirm";

export type ConfirmDialogProps = ConfirmOptions & {
  open: boolean;
  /** Called with the answer; `false` for Cancel, Escape, outside press or swipe. */
  onAnswer: (ok: boolean) => void;
  onOpenChangeComplete?: (open: boolean) => void;
};

const sheetButton =
  "flex h-14 w-full items-center justify-center px-4 text-title3 font-normal outline-none transition-colors duration-150 active:bg-fill-2 focus-visible:bg-fill-2 [@media(hover:hover)]:hover:bg-fill-1";

/**
 * Declarative confirmation UI. Phones: iOS action sheet (destructive action at the bottom of
 * the group, Cancel separate). Larger screens: compact centered alert. Most code should call
 * `confirm()` instead of rendering this directly.
 */
export function ConfirmDialog(props: ConfirmDialogProps) {
  const isPhone = useIsPhone();
  return isPhone ? <ConfirmActionSheet {...props} /> : <ConfirmAlert {...props} />;
}

function labels(p: ConfirmOptions) {
  return {
    confirm: p.confirmLabel ?? (p.destructive ? "Delete" : "OK"),
    cancel: p.cancelLabel ?? "Cancel",
  };
}

function ConfirmActionSheet(p: ConfirmDialogProps) {
  const l = labels(p);
  return (
    <Drawer.Root open={p.open} onOpenChange={(o) => !o && p.onAnswer(false)} onOpenChangeComplete={p.onOpenChangeComplete}>
      <Drawer.Portal>
        <Drawer.Backdrop className="ui-backdrop" />
        <Drawer.Viewport className="ui-sheet-viewport">
          <Drawer.Popup className="ui-action-sheet" role="alertdialog">
            <div className="glass-thick overflow-hidden rounded-md elevation-e3">
              <div className="px-4 pt-3.5 pb-3 text-center">
                <Drawer.Title className="text-footnote font-semibold text-fg-3">{p.title}</Drawer.Title>
                {p.message && <Drawer.Description className="mt-0.5 text-footnote text-fg-3">{p.message}</Drawer.Description>}
              </div>
              <button
                type="button"
                className={cn(sheetButton, "border-t-[0.5px] border-separator", p.destructive ? "text-danger" : "text-accent-text")}
                onClick={() => p.onAnswer(true)}
              >
                {l.confirm}
              </button>
            </div>
            <div className="glass-thick overflow-hidden rounded-md elevation-e3">
              <Drawer.Close className={cn(sheetButton, "font-semibold text-accent-text")}>{l.cancel}</Drawer.Close>
            </div>
          </Drawer.Popup>
        </Drawer.Viewport>
      </Drawer.Portal>
    </Drawer.Root>
  );
}

function ConfirmAlert(p: ConfirmDialogProps) {
  const l = labels(p);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  return (
    <AlertDialog.Root open={p.open} onOpenChange={(o) => !o && p.onAnswer(false)} onOpenChangeComplete={p.onOpenChangeComplete}>
      <AlertDialog.Portal>
        <AlertDialog.Backdrop className="ui-backdrop" />
        <AlertDialog.Viewport className="ui-dialog-viewport">
          <AlertDialog.Popup
            initialFocus={p.destructive ? cancelRef : confirmRef}
            className="ui-dialog ui-alert glass-thick specular w-[min(100%,300px)] p-5 pt-6 text-center text-fg elevation-e4"
          >
            <AlertDialog.Title className="text-headline text-fg">{p.title}</AlertDialog.Title>
            {p.message && <AlertDialog.Description className="mt-1.5 text-footnote text-fg-2">{p.message}</AlertDialog.Description>}
            <div className="mt-5 grid grid-cols-2 gap-2">
              <AlertDialog.Close
                ref={cancelRef}
                className="pressable h-10 rounded-full bg-fill-2 px-3 text-subhead font-semibold text-fg hover:bg-fill-3"
              >
                {l.cancel}
              </AlertDialog.Close>
              <button
                ref={confirmRef}
                type="button"
                onClick={() => p.onAnswer(true)}
                className={cn(
                  "pressable h-10 rounded-full px-3 text-subhead font-semibold specular hover:brightness-[1.05]",
                  p.destructive ? "bg-danger-fill text-white" : "bg-accent-fill text-accent-fg",
                )}
              >
                {l.confirm}
              </button>
            </div>
          </AlertDialog.Popup>
        </AlertDialog.Viewport>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}

/**
 * Renders queued `confirm()` requests one at a time. Mount once (Providers).
 * The promise resolves the moment the user answers; the dialog animates out afterwards.
 */
export function ConfirmHost() {
  const queue = useConfirmQueue();
  const [closing, setClosing] = useState<ConfirmRequest | null>(null);
  const current = queue[0] ?? null;
  const shown = current ?? closing;
  if (!shown) return null;
  const answer = (ok: boolean) => {
    if (!current) return;
    setClosing(current);
    confirmStore.resolve(current.id, ok);
  };
  return (
    <ConfirmDialog
      {...shown}
      open={!!current}
      onAnswer={answer}
      onOpenChangeComplete={(o) => {
        if (!o) setClosing(null);
      }}
    />
  );
}
export { confirm, type ConfirmOptions } from "./confirm";
