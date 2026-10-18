"use client";
import { Toast } from "@base-ui/react/toast";
import { CircleAlert, CircleCheck, Undo2, X } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { iconButtonVariants } from "./IconButton";
import { toastManager, type ToastData, type ToastType } from "./toast-store";

// The imperative API lives in ./toast-store (no React); re-exported so callers can
// `import { toast } from "@/components/ui/Toast"`. (Not `./toast.ts`: on case-insensitive
// file systems the bundler would resolve `./toast` to this file.)
export { toast, toastManager, DEFAULT_TOAST_DURATION } from "./toast-store";
export type { ToastAction, ToastOptions, ToastType } from "./toast-store";

const TYPE_ICON: Partial<Record<ToastType, ReactNode>> = {
  success: <CircleCheck size={20} className="text-success" strokeWidth={2.2} />,
  error: <CircleAlert size={20} className="text-danger" strokeWidth={2.2} />,
  undo: <Undo2 size={18} className="text-fg-3" strokeWidth={2.2} />,
};

/** Renders `toast()` calls. Mount once (Providers). */
export function ToastHost() {
  return (
    <Toast.Provider toastManager={toastManager} limit={3}>
      <Toast.Portal>
        <Toast.Viewport className="ui-toast-viewport">
          <ToastList />
        </Toast.Viewport>
      </Toast.Portal>
    </Toast.Provider>
  );
}

function ToastList() {
  const { toasts } = Toast.useToastManager<ToastData>();
  return toasts.map((t) => {
    const icon = t.data?.icon ?? TYPE_ICON[(t.type as ToastType) ?? "default"];
    return (
      <Toast.Root
        key={t.id}
        toast={t}
        swipeDirection={["down", "left", "right"]}
        className="ui-toast glass-thick specular elevation-e3 rounded-xl text-fg"
      >
        <Toast.Content className="ui-toast-content flex min-h-[52px] items-center gap-3 py-2 pr-2 pl-4">
          {icon && <span className="grid shrink-0 place-items-center">{icon}</span>}
          <div className="min-w-0 flex-1 py-1">
            <Toast.Title className="truncate text-subhead font-semibold" />
            <Toast.Description className="line-clamp-2 text-footnote text-fg-2" />
          </div>
          {t.actionProps && (
            <Toast.Action className="pressable h-9 shrink-0 rounded-full bg-accent-soft px-4 text-subhead font-semibold text-accent-text" />
          )}
          <Toast.Close
            aria-label="Dismiss"
            className={cn(iconButtonVariants({ variant: "plain", size: "sm" }), "hidden [@media(hover:hover)]:inline-grid")}
          >
            <X strokeWidth={2.4} />
          </Toast.Close>
        </Toast.Content>
      </Toast.Root>
    );
  });
}
