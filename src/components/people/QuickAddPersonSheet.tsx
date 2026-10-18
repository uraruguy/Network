"use client";
import { ChevronDown } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState, useSyncExternalStore, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { GlassInput } from "@/components/glass/GlassInput";
import { Field } from "@/components/ui/Field";
import { Sheet } from "@/components/ui/Sheet";
import { collapse } from "@/lib/motion";
import { usePersonWrites } from "@/lib/queries/people";
import { ActivityPicker } from "./ActivityPicker";
import { CityPicker } from "./CityPicker";
import { confirmDiscard, emptyPerson, FormSection, isPersonDirty, PersonFormFields, toPersonInput, validatePerson, type PersonFormErrors, type PersonFormValues } from "./PersonForm";

/* ------------------------------------------------------------------ */
/*  Global store: one quick-add sheet for the whole app                */
/* ------------------------------------------------------------------ */

type QuickAddState = { open: boolean; name: string; onClose: (() => void) | null };

let state: QuickAddState = { open: false, name: "", onClose: null };
let hosts = 0;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
};

/** Opens the app-wide quick-add sheet (mounted by `QuickAddPersonHost`). */
export function openQuickAdd(opts: { name?: string; onClose?: () => void } = {}) {
  state = { open: true, name: opts.name ?? "", onClose: opts.onClose ?? null };
  emit();
}

function closeQuickAdd() {
  const cb = state.onClose;
  state = { ...state, open: false, onClose: null };
  emit();
  cb?.();
}

const useQuickAddState = () => useSyncExternalStore(subscribe, () => state, () => state);
const useHosted = () =>
  useSyncExternalStore(
    subscribe,
    () => hosts > 0,
    () => false,
  );

const isTyping = (el: EventTarget | null) => {
  const t = el as HTMLElement | null;
  return !!t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || !!t.closest?.("[contenteditable=true],[role=dialog],[role=menu],[role=listbox]"));
};

/**
 * Mount once inside the app shell: the quick-add sheet, the `⌘N` / `N` shortcuts and the
 * `?new=1` deep link (PWA shortcut "Add person").
 */
export function QuickAddPersonHost() {
  return (
    <Suspense fallback={null}>
      <Host />
    </Suspense>
  );
}

function Host() {
  const s = useQuickAddState();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  useEffect(() => {
    hosts += 1;
    emit();
    return () => {
      hosts -= 1;
      emit();
    };
  }, []);

  // Pages that give ⌘N its own meaning (person and note pages: a new note) handle it in the
  // capture phase and preventDefault; handled events are skipped here, so one press = one action.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.repeat || e.altKey || e.shiftKey) return;
      const cmdN = (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "n";
      const bareN = !e.metaKey && !e.ctrlKey && e.key.toLowerCase() === "n" && !isTyping(e.target) && !isTyping(document.activeElement);
      if (!cmdN && !bareN) return;
      e.preventDefault();
      if (!state.open) openQuickAdd();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const deepLink = params.get("new") === "1";
  useEffect(() => {
    if (!deepLink) return;
    if (!state.open) openQuickAdd();
    const next = new URLSearchParams(params);
    next.delete("new");
    router.replace(`${pathname}${next.size ? `?${next}` : ""}`, { scroll: false });
  }, [deepLink, params, pathname, router]);

  return <QuickAddPersonSheet open={s.open} onOpenChange={(o) => (o ? openQuickAdd() : closeQuickAdd())} initialName={s.name} />;
}

/* ------------------------------------------------------------------ */
/*  The sheet                                                          */
/* ------------------------------------------------------------------ */

export type QuickAddPersonSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Prefill the name (e.g. from a search that found nobody). */
  initialName?: string;
  /** Called with the new person's id after it's created (default: open their profile). */
  onCreated?: (id: string) => void;
};

/**
 * Add someone in seconds: name, where they live, what you do together. "More details" unfolds
 * the full form in place. The person exists instantly (optimistic, offline-safe) and their
 * profile opens right away.
 */
export function QuickAddPersonSheet({ open, onOpenChange, initialName = "", onCreated }: QuickAddPersonSheetProps) {
  const router = useRouter();
  const writes = usePersonWrites();
  const [values, setValues] = useState<PersonFormValues>(emptyPerson);
  const [errors, setErrors] = useState<PersonFormErrors>({});
  const [more, setMore] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);
  const done = useRef(false);

  const [wasOpen, setWasOpen] = useState(false);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setValues({ ...emptyPerson, displayName: initialName });
      setErrors({});
      setMore(false);
    }
  }
  useEffect(() => {
    if (open) done.current = false;
  }, [open]);

  const base = { ...emptyPerson, displayName: initialName };
  const dirty = open && isPersonDirty(base, values);

  const change = (patch: Partial<PersonFormValues>) => {
    setValues((v) => ({ ...v, ...patch }));
    if (patch.displayName !== undefined && errors.displayName) setErrors((e) => ({ ...e, displayName: undefined }));
  };

  const create = () => {
    const errs = validatePerson(values);
    if (Object.keys(errs).length) {
      setErrors(errs);
      if (errs.displayName) nameRef.current?.focus();
      else setMore(true);
      return false;
    }
    const id = writes.create(toPersonInput(values));
    done.current = true;
    if (onCreated) onCreated(id);
    else router.push(`/people/${id}`);
  };

  const requestOpenChange = (next: boolean) => {
    if (next) return onOpenChange(true);
    if (done.current) return onOpenChange(false);
    void confirmDiscard(dirty).then((ok) => ok && onOpenChange(false));
  };

  /** Return in the name field adds the person (other fields keep Return for themselves). */
  const onNameKey = (e: ReactKeyboardEvent<HTMLInputElement>) => {
    if (e.key !== "Enter" || e.nativeEvent.isComposing) return;
    e.preventDefault();
    if (create() !== false) onOpenChange(false);
  };

  return (
    <Sheet
      open={open}
      onOpenChange={requestOpenChange}
      title="New person"
      size={more ? "large" : "auto"}
      width={580}
      cancel
      done="Add"
      doneDisabled={!values.displayName.trim()}
      onDone={create}
      dismissible={!dirty}
      initialFocus={nameRef}
    >
      <form noValidate onSubmit={(e) => e.preventDefault()} className="space-y-6 pt-2">
        <FormSection>
          <Field label="Name" required error={errors.displayName}>
            <GlassInput
              ref={nameRef}
              value={values.displayName}
              onChange={(e) => change({ displayName: e.target.value })}
              placeholder="Full name"
              autoComplete="off"
              autoCapitalize="words"
              enterKeyHint="done"
              maxLength={200}
              onKeyDown={onNameKey}
            />
          </Field>
          <Field label="Lives in">
            <CityPicker value={values.homeLocation} onChange={(homeLocation) => change({ homeLocation })} placeholder="Search a city" />
          </Field>
        </FormSection>
        <FormSection title="Do together">
          <ActivityPicker value={values.activityIds} onChange={(activityIds) => change({ activityIds })} />
        </FormSection>

        <AnimatePresence initial={false} mode="popLayout">
          {more ? (
            <motion.div key="more" variants={collapse} initial="initial" animate="animate" exit="exit" className="overflow-hidden">
              <PersonFormFields values={values} onChange={change} errors={errors} hideName />
            </motion.div>
          ) : (
            <motion.div key="toggle" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <button
                type="button"
                onClick={() => setMore(true)}
                aria-expanded={more}
                className="pressable mx-auto flex h-11 items-center gap-1.5 rounded-full px-4 text-subhead font-medium text-accent-text hover:bg-accent-soft"
              >
                More details
                <ChevronDown size={16} strokeWidth={2.4} aria-hidden />
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </form>
    </Sheet>
  );
}

/**
 * v1-compatible controlled entry point (People list, Today). With `QuickAddPersonHost` mounted it
 * drives the single app-wide sheet; otherwise it renders its own.
 */
export function NewPersonSheet({ open, onClose, initialName }: { open: boolean; onClose: () => void; initialName?: string }) {
  const hosted = useHosted();
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);
  useEffect(() => {
    if (!hosted || !open) return;
    const cb = () => onCloseRef.current();
    if (!state.open) openQuickAdd({ name: initialName, onClose: cb });
    // Already open (the shortcut or the ?new=1 deep link got there first): report the close to us too.
    else if (!state.onClose) state = { ...state, onClose: cb };
  }, [hosted, open, initialName]);
  if (hosted) return null;
  return <QuickAddPersonSheet open={open} onOpenChange={(o) => !o && onClose()} initialName={initialName} />;
}
