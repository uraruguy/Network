"use client";
import { GitMerge, MoreHorizontal, Pencil, Tag as TagIcon, Trash2 } from "lucide-react";
import { useState } from "react";
import { GlassButton } from "@/components/glass/GlassButton";
import { GlassInput } from "@/components/glass/GlassInput";
import { Combobox, filterByQuery } from "@/components/ui/Combobox";
import { confirm } from "@/components/ui/confirm";
import { Dialog, DialogClose } from "@/components/ui/Dialog";
import { EmptyState } from "@/components/ui/EmptyState";
import { Field } from "@/components/ui/Field";
import { IconButton } from "@/components/ui/IconButton";
import { InsetGroup } from "@/components/ui/InsetGroup";
import { ListRow } from "@/components/ui/ListRow";
import { Menu } from "@/components/ui/Menu";
import { SearchField } from "@/components/ui/SearchField";
import { matchesQuery } from "@/components/ui/search";
import { SkeletonRows } from "@/components/ui/Skeleton";
import { toast } from "@/components/ui/Toast";
import { paletteVar } from "@/lib/constants/palette";
import { useDeleteTag, useMergeTags, useTags, useUpdateTag } from "@/lib/queries/taxonomy";
import type { TagRow } from "@/lib/queries/types";
import { SectionPage } from "../SettingsShell";

const people = (n: number) => `${n} ${n === 1 ? "person" : "people"}`;

type Mode = { kind: "rename" | "merge"; tag: TagRow; intoId?: string } | null;

export function TagsSection() {
  const { data: tags = [], isPending } = useTags();
  const remove = useDeleteTag();
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState<Mode>(null);
  const visible = query ? tags.filter((t) => matchesQuery(t.name, query)) : tags;

  const del = async (t: TagRow) => {
    const ok = await confirm({
      title: `Delete “${t.name}”?`,
      message: t.count ? `It's removed from ${people(t.count)}. Nothing else changes.` : "No one has this tag.",
      confirmLabel: "Delete",
      destructive: true,
    });
    if (ok) remove.mutate(t.id, { onSuccess: () => toast(`Deleted “${t.name}”`), onError: (e) => toast.error("Couldn't delete", { description: e.message }) });
  };

  return (
    <SectionPage id="tags" description="Free-form labels you add on people. Rename them, merge duplicates, or clean up ones you no longer use.">
      {isPending ? (
        <div className="surface overflow-hidden rounded-lg">
          <SkeletonRows count={5} avatar={false} />
        </div>
      ) : tags.length === 0 ? (
        <div className="surface rounded-lg">
          <EmptyState compact icon={<TagIcon />} title="No tags yet" description="Tags appear here once you add them to someone — type one in a person's Tags field." />
        </div>
      ) : (
        <>
          {tags.length > 8 && <SearchField value={query} onChange={setQuery} placeholder={`Search ${tags.length} tags`} aria-label="Search tags" />}
          <InsetGroup footer={query && !visible.length ? undefined : `${tags.length} tag${tags.length === 1 ? "" : "s"}. Unused tags show 0 people.`}>
            {visible.length ? (
              visible.map((t) => (
                <ListRow
                  key={t.id}
                  icon={<span className="block size-3 rounded-full" style={{ background: t.color ? paletteVar(t.color) : "var(--fg-4)" }} />}
                  label={t.name}
                  description={people(t.count)}
                  accessory={
                    <Menu
                      title={t.name}
                      align="end"
                      trigger={<IconButton size="sm" variant="plain" label={`Actions for ${t.name}`} icon={<MoreHorizontal />} />}
                      items={[
                        { label: "Rename…", icon: <Pencil />, onSelect: () => setMode({ kind: "rename", tag: t }) },
                        { label: "Merge into…", icon: <GitMerge />, onSelect: () => setMode({ kind: "merge", tag: t }), disabled: tags.length < 2 },
                        "separator",
                        { label: "Delete…", icon: <Trash2 />, destructive: true, onSelect: () => void del(t) },
                      ]}
                    />
                  }
                />
              ))
            ) : (
              <p className="px-4 py-6 text-center text-subhead text-fg-3">No tags match “{query}”.</p>
            )}
          </InsetGroup>
        </>
      )}

      <RenameDialog mode={mode?.kind === "rename" ? mode : null} tags={tags} onClose={() => setMode(null)} onMergeInstead={(tag, intoId) => setMode({ kind: "merge", tag, intoId })} />
      <MergeDialog mode={mode?.kind === "merge" ? mode : null} tags={tags} onClose={() => setMode(null)} />
    </SectionPage>
  );
}

function RenameDialog({ mode, tags, onClose, onMergeInstead }: { mode: { tag: TagRow } | null; tags: TagRow[]; onClose: () => void; onMergeInstead: (tag: TagRow, intoId: string) => void }) {
  const update = useUpdateTag();
  const [name, setName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const tag = mode?.tag;
  const value = name ?? tag?.name ?? "";

  const close = () => {
    setName(null);
    setError(null);
    onClose();
  };

  const submit = () => {
    if (!tag) return;
    const next = value.replace(/\s+/g, " ").trim();
    if (!next) return setError("Tags need a name.");
    if (next === tag.name) return close();
    // Renaming onto an existing tag is a merge: offer it instead of failing.
    const clash = tags.find((t) => t.id !== tag.id && t.name.toLowerCase() === next.toLowerCase());
    if (clash) {
      setName(null);
      setError(null);
      return onMergeInstead(tag, clash.id);
    }
    update.mutate(
      { id: tag.id, patch: { name: next } },
      {
        onSuccess: () => {
          toast.success(`Renamed to “${next}”`);
          close();
        },
        onError: (e) => setError(e.message),
      },
    );
  };

  return (
    <Dialog
      open={!!mode}
      onOpenChange={(o) => !o && close()}
      title="Rename tag"
      description={tag ? `Used by ${people(tag.count)}.` : undefined}
      actions={
        <>
          <DialogClose render={<GlassButton variant="ghost" />}>Cancel</DialogClose>
          <GlassButton variant="primary" loading={update.isPending} onClick={submit}>
            Rename
          </GlassButton>
        </>
      }
    >
      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <Field label="Name" error={error}>
          <GlassInput
            autoFocus
            value={value}
            maxLength={60}
            enterKeyHint="done"
            onChange={(e) => {
              setName(e.target.value);
              setError(null);
            }}
          />
        </Field>
      </form>
    </Dialog>
  );
}

function MergeDialog({ mode, tags, onClose }: { mode: { tag: TagRow; intoId?: string } | null; tags: TagRow[]; onClose: () => void }) {
  const merge = useMergeTags();
  const [target, setTarget] = useState<TagRow | null>(null);
  const tag = mode?.tag;
  const preset = mode?.intoId ? (tags.find((t) => t.id === mode.intoId) ?? null) : null;
  const into = target ?? preset;
  const others = tags.filter((t) => t.id !== tag?.id);

  const close = () => {
    setTarget(null);
    onClose();
  };

  const submit = () => {
    if (!tag || !into) return;
    merge.mutate(
      { id: tag.id, intoId: into.id },
      {
        onSuccess: () => {
          toast.success(`Merged “${tag.name}” into “${into.name}”`);
          close();
        },
        onError: (e) => toast.error("Couldn't merge", { description: e.message }),
      },
    );
  };

  return (
    <Dialog
      open={!!mode}
      onOpenChange={(o) => !o && close()}
      title={tag ? `Merge “${tag.name}”` : "Merge tag"}
      description={tag ? `Everyone tagged “${tag.name}” (${people(tag.count)}) gets the tag you pick, then “${tag.name}” is deleted.` : undefined}
      actions={
        <>
          <DialogClose render={<GlassButton variant="ghost" />}>Cancel</DialogClose>
          <GlassButton variant="primary" disabled={!into} loading={merge.isPending} onClick={submit}>
            Merge
          </GlassButton>
        </>
      }
    >
      <Field label="Merge into">
        <Combobox<TagRow>
          aria-label="Merge into"
          value={into}
          onChange={setTarget}
          search={(q) => filterByQuery(others, q, (t) => t.name)}
          getKey={(t) => t.id}
          getLabel={(t) => t.name}
          placeholder="Search tags"
          renderItem={(t) => (
            <span className="flex items-center justify-between gap-3">
              <span className="truncate">{t.name}</span>
              <span className="shrink-0 text-footnote text-fg-3">{t.count}</span>
            </span>
          )}
        />
      </Field>
    </Dialog>
  );
}
