"use client";
import { useRouter } from "next/navigation";
import { GlassSheet } from "@/components/glass/GlassSheet";
import { useCreatePerson, useUpdatePerson } from "@/lib/queries/people";
import type { PersonDetail } from "@/lib/queries/types";
import { PersonForm, personToFormValues, toPersonInput } from "./PersonForm";

export function NewPersonSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const create = useCreatePerson();
  return (
    <GlassSheet open={open} onClose={onClose} title="New person">
      <PersonForm
        submitLabel="Add to my Network"
        busy={create.isPending}
        onCancel={onClose}
        onSubmit={(values) =>
          create.mutate(toPersonInput(values), {
            onSuccess: (p) => {
              onClose();
              router.push(`/people/${p.id}`);
            },
          })
        }
      />
    </GlassSheet>
  );
}

export function EditPersonSheet({ person, open, onClose }: { person: PersonDetail; open: boolean; onClose: () => void }) {
  const update = useUpdatePerson(person.id);
  return (
    <GlassSheet open={open} onClose={onClose} title="Edit">
      {open && (
        <PersonForm
          initial={personToFormValues(person)}
          submitLabel="Save"
          busy={update.isPending}
          onCancel={onClose}
          onSubmit={(values) => update.mutate(toPersonInput(values), { onSuccess: onClose })}
        />
      )}
    </GlassSheet>
  );
}
