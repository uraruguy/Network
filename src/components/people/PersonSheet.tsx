"use client";
import { useEffect, useRef, useState } from "react";
import { Sheet } from "@/components/ui/Sheet";
import { usePersonWrites } from "@/lib/queries/people";
import type { PersonDetailApi } from "@/lib/queries/types";
import { confirmDiscard, isPersonDirty, PersonFormFields, personToFormValues, toPersonPatch, validatePerson, type PersonFormErrors, type PersonFormValues } from "./PersonForm";

export { NewPersonSheet, QuickAddPersonSheet } from "./QuickAddPersonSheet";

/**
 * Edit a person in a large sheet (Cancel / Done). Done saves only what changed — optimistically,
 * so the profile updates under the closing sheet and the request syncs in the background.
 */
export function EditPersonSheet({ person, open, onClose }: { person: PersonDetailApi; open: boolean; onClose: () => void }) {
  const writes = usePersonWrites();
  const [initial, setInitial] = useState<PersonFormValues>(() => personToFormValues(person));
  const [values, setValues] = useState<PersonFormValues>(initial);
  const [errors, setErrors] = useState<PersonFormErrors>({});
  const closing = useRef(false);

  // Fresh values each time the sheet opens.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      const v = personToFormValues(person);
      setInitial(v);
      setValues(v);
      setErrors({});
    }
  }
  useEffect(() => {
    if (open) closing.current = false;
  }, [open]);

  const dirty = open && isPersonDirty(initial, values);

  const change = (patch: Partial<PersonFormValues>) => {
    setValues((v) => ({ ...v, ...patch }));
    if (Object.keys(patch).some((k) => k in errors)) setErrors((e) => Object.fromEntries(Object.entries(e).filter(([k]) => !(k in patch))));
  };

  const save = () => {
    const errs = validatePerson(values);
    if (Object.keys(errs).length) {
      setErrors(errs);
      return false;
    }
    const patch = toPersonPatch(initial, values);
    if (Object.keys(patch).length) writes.update(person.id, patch);
    closing.current = true;
  };

  const requestClose = (next: boolean) => {
    if (next) return;
    if (closing.current) return onClose();
    void confirmDiscard(dirty).then((ok) => ok && onClose());
  };

  return (
    <Sheet
      open={open}
      onOpenChange={requestClose}
      title="Edit"
      size="large"
      width={620}
      cancel
      done="Done"
      onDone={save}
      dismissible={!dirty}
    >
      {/* No implicit submit (Return in a picker shouldn't close the sheet); ⌘↩ saves. */}
      <form
        noValidate
        onSubmit={(e) => e.preventDefault()}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && save() !== false) {
            e.preventDefault();
            onClose();
          }
        }}
        className="pt-2"
      >
        <PersonFormFields values={values} onChange={change} errors={errors} personId={person.id} />
      </form>
    </Sheet>
  );
}
