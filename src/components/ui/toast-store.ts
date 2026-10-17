/**
 * Imperative toasts, callable from anywhere (mutations, event handlers, non-React code).
 *
 *   toast("Saved");
 *   toast({ title: "Reminder set", description: "Tue, 14 Oct", duration: 4000 });
 *   toast.undo("Note deleted", () => restore(note));
 *   toast.error("Couldn't sync", { description: err.message });
 *
 * Backed by Base UI's toast manager; rendered by <ToastHost/> (mounted in Providers) as a
 * stacked glass pill above the tab bar / safe area. Swipe down or sideways to dismiss.
 */
import { Toast } from "@base-ui/react/toast";
import type { ReactNode } from "react";

export type ToastType = "default" | "success" | "error" | "undo";

export type ToastAction = { label: string; onClick: () => void };

export type ToastOptions = {
  title: ReactNode;
  description?: ReactNode;
  action?: ToastAction;
  /** ms before auto-dismiss (default 5000; 0 = stay until dismissed). */
  duration?: number;
  type?: ToastType;
  /** Re-using an id updates that toast in place (and restarts its timer). */
  id?: string;
  /** Leading icon; defaults per type. */
  icon?: ReactNode;
  onClose?: () => void;
};

export type ToastData = { icon?: ReactNode };

export const DEFAULT_TOAST_DURATION = 5000;

export const toastManager = Toast.createToastManager();

let seq = 0;

function show(options: ToastOptions): string {
  const id = options.id ?? `toast-${++seq}`;
  const { action } = options;
  return toastManager.add<ToastData>({
    id,
    title: options.title,
    description: options.description,
    type: options.type ?? "default",
    timeout: options.duration ?? DEFAULT_TOAST_DURATION,
    priority: options.type === "error" ? "high" : "low",
    onClose: options.onClose,
    data: { icon: options.icon },
    actionProps: action
      ? {
          children: action.label,
          onClick: () => {
            action.onClick();
            toastManager.close(id);
          },
        }
      : undefined,
  });
}

type Extra = Omit<ToastOptions, "title" | "type">;

export const toast = Object.assign((options: ToastOptions | string) => show(typeof options === "string" ? { title: options } : options), {
  success: (title: ReactNode, extra?: Extra) => show({ ...extra, title, type: "success" }),
  error: (title: ReactNode, extra?: Extra) => show({ ...extra, title, type: "error" }),
  /** Destructive-action receipt with an Undo button (6s by default). */
  undo: (message: ReactNode, onUndo: () => void, extra?: Omit<Extra, "action">) =>
    show({ duration: 6000, ...extra, title: message, type: "undo", action: { label: "Undo", onClick: onUndo } }),
  /** Close one toast, or all when called without an id. */
  dismiss: (id?: string) => toastManager.close(id),
  /** Update an existing toast's content. */
  update: (id: string, options: Partial<Omit<ToastOptions, "id" | "action">>) =>
    toastManager.update<ToastData>(id, {
      title: options.title,
      description: options.description,
      type: options.type,
      timeout: options.duration,
      ...(options.icon !== undefined ? { data: { icon: options.icon } } : {}),
    }),
});
