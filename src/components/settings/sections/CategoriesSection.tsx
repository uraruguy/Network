"use client";
import { Check, Plus, Shapes, Trash2 } from "lucide-react";
import { useState } from "react";
import { GlassButton } from "@/components/glass/GlassButton";
import { GlassInput } from "@/components/glass/GlassInput";
import { CategoryIcon, CATEGORY_ICON_NAMES } from "@/components/people/CategoryIcon";
import { confirm } from "@/components/ui/confirm";
import { EmptyState } from "@/components/ui/EmptyState";
import { Field } from "@/components/ui/Field";
import { InsetGroup } from "@/components/ui/InsetGroup";
import { ListRow } from "@/components/ui/ListRow";
import { Sheet } from "@/components/ui/Sheet";
import { SkeletonRows } from "@/components/ui/Skeleton";
import { toast } from "@/components/ui/Toast";
import { nearestPalette, PALETTE, PALETTE_HEX, paletteVar } from "@/lib/constants/palette";
import { useCreateCategory, useDeleteCategory, useReorderCategories, useUpdateCategory } from "@/lib/queries/settings";
import { useTaxonomy } from "@/lib/queries/taxonomy";
import { slugify } from "@/lib/text";
import { cn } from "@/lib/utils";
import { ReorderList } from "../parts/ReorderList";
import { SectionPage } from "../SettingsShell";

type Row = { id: string; name: string; color: string; icon: string; sort: number; count: number };
type Draft = { id?: string; name: string; color: string; icon: string; count?: number };

const people = (n: number) => `${n} ${n === 1 ? "person" : "people"}`;

export function CategoriesSection() {
  const { data, isPending } = useTaxonomy();
  const reorder = useReorderCategories();
  const [draft, setDraft] = useState<Draft | null>(null);
  const cats = (data?.categories ?? []) as Row[];

  const openNew = () => setDraft({ name: "", color: PALETTE_HEX[cats.length % PALETTE_HEX.length]!, icon: "sparkles" });

  return (
    <SectionPage
      id="categories"
      description="Group people the way you think about them. Categories colour the globe and filter every list."
      actions={
        cats.length > 0 && (
          <GlassButton size="sm" variant="soft" onClick={openNew}>
            <Plus size={15} /> Add
          </GlassButton>
        )
      }
    >
      {isPending ? (
        <div className="surface overflow-hidden rounded-lg">
          <SkeletonRows count={4} />
        </div>
      ) : cats.length === 0 ? (
        <div className="surface rounded-lg">
          <EmptyState
            icon={<Shapes />}
            title="No categories yet"
            description="Friends, Work, Family, Investors… whatever fits your life."
            action={
              <GlassButton variant="primary" size="sm" onClick={openNew}>
                <Plus size={16} /> Add category
              </GlassButton>
            }
          />
        </div>
      ) : (
        <section className="space-y-1.5">
          <ReorderList
            aria-label="Categories"
            items={cats}
            getId={(c) => c.id}
            getLabel={(c) => c.name}
            onReorder={(ids) => reorder.mutateAsync(ids).catch((e: Error) => toast.error("Couldn't save the order", { description: e.message }))}
            renderItem={(c, { handle }) => (
              <div className="flex min-h-[52px] items-center gap-3 pr-2 pl-4">
                <button type="button" onClick={() => setDraft({ id: c.id, name: c.name, color: c.color, icon: c.icon, count: c.count })} className="flex min-w-0 flex-1 items-center gap-3 self-stretch py-2 text-left outline-offset-0">
                  <span className="grid size-[30px] shrink-0 place-items-center rounded-full text-white" style={{ background: paletteVar(c.color) }} aria-hidden>
                    <CategoryIcon name={c.icon} size={16} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-body text-fg">{c.name}</span>
                    <span className="block text-footnote text-fg-3">{people(c.count)}</span>
                  </span>
                </button>
                {handle}
              </div>
            )}
          />
          <p className="px-4 text-footnote text-fg-3">Tap to edit. Drag the handle to change the order used in pickers and filters.</p>
        </section>
      )}

      <CategorySheet draft={draft} existing={cats} onClose={() => setDraft(null)} onChange={setDraft} />
    </SectionPage>
  );
}

function CategorySheet({ draft, existing, onChange, onClose }: { draft: Draft | null; existing: Row[]; onChange: (d: Draft) => void; onClose: () => void }) {
  const create = useCreateCategory();
  const update = useUpdateCategory();
  const remove = useDeleteCategory();
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [shown, setShown] = useState<Draft | null>(draft);
  // Keep the last draft rendered while the sheet animates closed.
  if (draft && draft !== shown) setShown(draft);
  const d = draft ?? shown;

  const validate = (x: Draft) => {
    const slug = slugify(x.name);
    if (!x.name.trim() || !slug) return "Give the category a name.";
    if (existing.some((c) => c.id !== x.id && slugify(c.name) === slug)) return "A category with this name already exists.";
    return null;
  };

  const save = async () => {
    if (!draft) return;
    setSubmitted(true);
    const problem = validate(draft);
    setError(problem);
    if (problem) return false;
    try {
      const body = { name: draft.name.trim(), color: draft.color, icon: draft.icon };
      if (draft.id) await update.mutateAsync({ id: draft.id, patch: body });
      else await create.mutateAsync({ ...body, sort: existing.reduce((m, c) => Math.max(m, c.sort), 0) + 1 });
      toast.success(draft.id ? "Category saved" : `Added “${body.name}”`);
      setSubmitted(false);
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    }
  };

  const del = async () => {
    if (!draft?.id) return;
    const n = draft.count ?? 0;
    const ok = await confirm({
      title: `Delete “${draft.name}”?`,
      message: n ? `${people(n)} will lose this category. Their other categories and notes stay.` : "No one is in this category.",
      confirmLabel: "Delete",
      destructive: true,
    });
    if (!ok) return;
    try {
      await remove.mutateAsync(draft.id);
      toast(`Deleted “${draft.name}”`);
      onClose();
    } catch (e) {
      toast.error("Couldn't delete", { description: (e as Error).message });
    }
  };

  return (
    <Sheet
      open={!!draft}
      onOpenChange={(o) => {
        if (!o) {
          onClose();
          setError(null);
          setSubmitted(false);
        }
      }}
      title={d?.id ? "Edit category" : "New category"}
      cancel
      done={d?.id ? "Save" : "Add"}
      onDone={save}
      dismissible={false}
    >
      {d && (
        <form
          noValidate
          className="space-y-5 pt-1"
          onSubmit={(e) => {
            e.preventDefault();
            void save().then((ok) => ok && onClose());
          }}
        >
          <div className="flex justify-center pt-1 pb-1">
            <span className="grid size-16 place-items-center rounded-full text-white shadow-e2" style={{ background: paletteVar(d.color) }} aria-hidden>
              <CategoryIcon name={d.icon} size={28} />
            </span>
          </div>
          <Field label="Name" error={submitted ? error : null}>
            <GlassInput
              autoFocus={!d.id}
              value={d.name}
              maxLength={60}
              placeholder="e.g. Climbing friends"
              enterKeyHint="done"
              onChange={(e) => {
                const next = { ...d, name: e.target.value };
                onChange(next);
                if (submitted) setError(validate(next));
              }}
            />
          </Field>

          <fieldset>
            <legend className="px-1 pb-2 text-footnote font-medium text-fg-2">Colour</legend>
            <div role="radiogroup" aria-label="Colour" className="grid grid-cols-5 justify-items-center gap-y-3 sm:grid-cols-10">
              {PALETTE.map((p) => {
                // Legacy (saturated) colours select their nearest muted hue.
                const selected = nearestPalette(d.color)?.id === p.id;
                return (
                  <button
                    key={p.id}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    aria-label={p.label}
                    onClick={() => onChange({ ...d, color: p.hex })}
                    className={cn("pressable grid size-11 place-items-center rounded-full ring-offset-2 ring-offset-surface-solid sm:size-9", selected && "ring-2 ring-fg-3")}
                    style={{ background: p.cssVar }}
                  >
                    {selected && <Check size={16} strokeWidth={3} className="text-white" />}
                  </button>
                );
              })}
            </div>
          </fieldset>

          <fieldset>
            <legend className="px-1 pb-2 text-footnote font-medium text-fg-2">Icon</legend>
            <div role="radiogroup" aria-label="Icon" className="grid grid-cols-5 gap-2">
              {CATEGORY_ICON_NAMES.map((ic) => {
                const selected = d.icon === ic;
                return (
                  <button
                    key={ic}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    aria-label={ic.replace(/-/g, " ")}
                    onClick={() => onChange({ ...d, icon: ic })}
                    className={cn("pressable grid h-12 place-items-center rounded-sm transition-colors", selected ? "bg-accent-fill text-accent-fg" : "bg-fill-1 text-fg-2 hover:bg-fill-2")}
                  >
                    <CategoryIcon name={ic} size={20} />
                  </button>
                );
              })}
            </div>
          </fieldset>

          {d.id && (
            <InsetGroup>
              <ListRow icon={<Trash2 />} label="Delete category" destructive onClick={del} description={d.count ? people(d.count) : undefined} />
            </InsetGroup>
          )}
        </form>
      )}
    </Sheet>
  );
}
