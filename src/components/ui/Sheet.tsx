"use client";
import { Dialog } from "@base-ui/react/dialog";
import { Drawer } from "@base-ui/react/drawer";
import { X } from "lucide-react";
import { useState, type CSSProperties, type ReactElement, type ReactNode } from "react";
import { useIsPhone } from "@/lib/media";
import { cn } from "@/lib/utils";
import { Spinner } from "./Spinner";
import { iconButtonVariants } from "./IconButton";

export type SheetSize = "auto" | "large" | "full";
export type SheetSnapPoint = number | string;

type OpenChangeDetails = { reason: string; cancel: () => void };

export type SheetProps = {
  /** Controlled open state. Omit (and pass `trigger`) for uncontrolled use. */
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Fires after the open/close animation finished. */
  onOpenChangeComplete?: (open: boolean) => void;
  /** Element that opens the sheet (uncontrolled use), e.g. `<GlassButton>Edit</GlassButton>`. */
  trigger?: ReactElement;

  title?: ReactNode;
  /** Secondary line under the title. */
  description?: ReactNode;
  children?: ReactNode;
  /** Pinned below the scrolling body (safe-area aware). */
  footer?: ReactNode;

  /** Phone height: content-sized (default), iOS "large" detent, or full screen. */
  size?: SheetSize;
  /** Desktop dialog max width in px. Default 560. */
  width?: number;
  /** Phone-only snap points (fractions of viewport height, px numbers > 1, or "px"/"rem" strings). */
  snapPoints?: SheetSnapPoint[];

  /** iOS header — left: Cancel (closes). `true` → "Cancel", string → custom label. */
  cancel?: boolean | string;
  onCancel?: () => void;
  /** iOS header — right: bold confirm action ("Done", "Save", "Add"). */
  done?: string;
  /** Return `false` (or a promise of it) to keep the sheet open; a promise shows a spinner. */
  onDone?: () => unknown;
  doneDisabled?: boolean;
  doneLoading?: boolean;
  /** Replace the header's left/right slots entirely. */
  headerLeft?: ReactNode;
  headerRight?: ReactNode;
  /** Hide the default close (×) button shown when there is no `done`/`headerRight`. */
  hideClose?: boolean;

  /** `false`: outside presses and swipes don't dismiss (unsaved changes). Escape still does. */
  dismissible?: boolean;
  /** Element to focus on open; defaults to Base UI behaviour (first tabbable, or popup on touch). */
  initialFocus?: React.RefObject<HTMLElement | null> | boolean;
  className?: string;
  bodyClassName?: string;
};

const textButton =
  "pressable inline-flex h-11 min-w-11 items-center justify-center rounded-full px-2 text-body text-accent-text disabled:opacity-40 disabled:pointer-events-none hover:bg-accent-soft";

/**
 * The app's modal surface: an iOS bottom sheet on phones (swipe to dismiss, optional snap
 * points) and a centered glass dialog from `sm` up. Focus is trapped and restored, Escape and
 * outside presses close it, and page scroll is locked (iOS-safe) while open.
 *
 *   <Sheet open={open} onOpenChange={setOpen} title="New person" cancel done="Add" onDone={save}>
 *     …form…
 *   </Sheet>
 */
export function Sheet(props: SheetProps) {
  const isPhone = useIsPhone();
  const { open: openProp, defaultOpen = false, onOpenChange, dismissible = true } = props;
  const [uncontrolled, setUncontrolled] = useState(defaultOpen);
  const open = openProp ?? uncontrolled;

  const handleOpenChange = (next: boolean, details?: OpenChangeDetails) => {
    if (!next && !dismissible && details && (details.reason === "outside-press" || details.reason === "swipe")) {
      details.cancel();
      return;
    }
    if (openProp === undefined) setUncontrolled(next);
    onOpenChange?.(next);
  };

  return isPhone ? (
    <PhoneSheet {...props} open={open} onChange={handleOpenChange} />
  ) : (
    <DesktopSheet {...props} open={open} onChange={handleOpenChange} />
  );
}

type InnerProps = SheetProps & { open: boolean; onChange: (open: boolean, details?: OpenChangeDetails) => void };

function PhoneSheet(p: InnerProps) {
  const size = p.size ?? "auto";
  const points = p.snapPoints?.length ? p.snapPoints : undefined;
  // Controlled snap point: always (re)opens at the first (smallest) detent.
  const [activeSnap, setActiveSnap] = useState<SheetSnapPoint | null>(null);
  const currentSnap = points ? (activeSnap !== null && points.includes(activeSnap) ? activeSnap : points[0]!) : undefined;
  return (
    <Drawer.Root
      // Remount when snap points are added/removed — Base UI can't switch modes in place.
      key={points ? points.join("|") : "no-snap"}
      open={p.open}
      onOpenChange={(o, d) => p.onChange(o, d)}
      onOpenChangeComplete={(o) => {
        if (!o) setActiveSnap(null);
        p.onOpenChangeComplete?.(o);
      }}
      snapPoints={points}
      snapPoint={currentSnap}
      onSnapPointChange={points ? (s) => setActiveSnap(s) : undefined}
    >
      {p.trigger && <Drawer.Trigger render={p.trigger} />}
      <Drawer.VirtualKeyboardProvider>
        <Drawer.Portal>
          <Drawer.Backdrop className="ui-backdrop" />
          <Drawer.Viewport className="ui-sheet-viewport touch-none">
            <Drawer.Popup
              initialFocus={p.initialFocus}
              data-size={size}
              data-snap={points ? "" : undefined}
              className={cn("ui-sheet glass-thick specular touch-none text-fg", p.className)}
            >
              <SheetHeader {...p} kit={Drawer} phone />
              <Drawer.Content
                className={cn(
                  "min-h-0 flex-1 touch-auto overflow-y-auto overscroll-contain px-4",
                  p.footer ? "pb-4" : "pb-[calc(16px+var(--sab))]",
                  p.bodyClassName,
                )}
              >
                {p.children}
              </Drawer.Content>
              {p.footer && <SheetFooter>{p.footer}</SheetFooter>}
            </Drawer.Popup>
          </Drawer.Viewport>
        </Drawer.Portal>
      </Drawer.VirtualKeyboardProvider>
    </Drawer.Root>
  );
}

function DesktopSheet(p: InnerProps) {
  const tall = p.size === "large" || p.size === "full";
  return (
    <Dialog.Root open={p.open} onOpenChange={(o, d) => p.onChange(o, d)} onOpenChangeComplete={p.onOpenChangeComplete}>
      {p.trigger && <Dialog.Trigger render={p.trigger} />}
      <Dialog.Portal>
        <Dialog.Backdrop className="ui-backdrop" />
        <Dialog.Viewport className="ui-dialog-viewport">
          <Dialog.Popup
            initialFocus={p.initialFocus}
            style={{ "--dialog-width": `${p.width ?? 560}px` } as CSSProperties}
            className={cn("ui-dialog glass-thick specular overflow-hidden text-fg elevation-e4", tall && "h-[min(85dvh,880px)]", p.className)}
          >
            <SheetHeader {...p} kit={Dialog} />
            <div className={cn("min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-5", p.bodyClassName)}>{p.children}</div>
            {p.footer && <SheetFooter>{p.footer}</SheetFooter>}
          </Dialog.Popup>
        </Dialog.Viewport>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

type Kit = typeof Dialog | typeof Drawer;

function SheetHeader(p: InnerProps & { kit: Kit; phone?: boolean }) {
  const { kit: K } = p;
  const [busy, setBusy] = useState(false);
  const cancelLabel = p.cancel === true ? "Cancel" : p.cancel || null;

  const runDone = async () => {
    const result = p.onDone?.();
    if (result instanceof Promise) {
      setBusy(true);
      try {
        if ((await result) === false) return;
      } catch {
        return;
      } finally {
        setBusy(false);
      }
    } else if (result === false) return;
    p.onChange(false);
  };

  const left =
    p.headerLeft ??
    (cancelLabel ? (
      <K.Close className={textButton} onClick={() => p.onCancel?.()}>
        {cancelLabel}
      </K.Close>
    ) : null);

  const loading = busy || p.doneLoading;
  const right =
    p.headerRight ??
    (p.done ? (
      <button
        type="button"
        className={cn(textButton, "font-semibold")}
        disabled={p.doneDisabled || loading}
        aria-busy={loading || undefined}
        onClick={runDone}
      >
        {loading ? <Spinner size={18} /> : p.done}
      </button>
    ) : p.hideClose ? null : (
      <K.Close aria-label="Close" className={iconButtonVariants({ variant: "fill", size: "sm" })}>
        <X strokeWidth={2.4} />
      </K.Close>
    ));

  const hasVisibleClose = !!cancelLabel || (!p.done && !p.hideClose && !p.headerRight);

  return (
    <div className={cn("relative shrink-0 select-none", p.phone ? "px-2 pt-2 pb-1" : "px-3 pt-3 pb-1")}>
      {p.phone && <div aria-hidden className="mx-auto mb-1 h-[5px] w-9 rounded-full bg-fill-3" />}
      <div className="grid min-h-11 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2">
        <div className="flex justify-self-start">{left}</div>
        {p.title ? (
          <K.Title className="max-w-[56vw] truncate text-center text-headline text-fg sm:max-w-[360px]">{p.title}</K.Title>
        ) : (
          <span />
        )}
        <div className="flex justify-self-end pr-1">{right}</div>
      </div>
      {p.description && (
        <K.Description className="mx-auto -mt-1 mb-1 max-w-[42ch] px-4 text-center text-footnote text-fg-3">{p.description}</K.Description>
      )}
      {/* Touch screen readers need a close control inside a modal. */}
      {!hasVisibleClose && <K.Close className="sr-only">Close</K.Close>}
    </div>
  );
}

function SheetFooter({ children }: { children: ReactNode }) {
  return (
    <div className="shrink-0 border-t-[0.5px] border-separator px-4 pt-3 pb-[calc(12px+var(--sab))] sm:px-5 sm:pb-4">{children}</div>
  );
}
