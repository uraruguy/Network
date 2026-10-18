"use client";
import { useMemo } from "react";
import { Combobox, filterByQuery } from "@/components/ui/Combobox";
import type { ModelOption, ModelProvider } from "@/lib/connections/models";
import { useModels } from "@/lib/queries/settings";

const ctx = (n?: number) => (!n ? null : n >= 1_000_000 ? `${Math.round(n / 100_000) / 10}M` : `${Math.round(n / 1000)}K`);

/**
 * Model id picker: the provider's live catalogue (OpenRouter `anthropic/*`, Anthropic /v1/models)
 * with free text for anything else. `null` = the provider default (shown as the placeholder).
 */
export function ModelPicker({ id, provider, value, onChange, defaultModel, label }: { id?: string; provider: ModelProvider; value: string | null; onChange: (v: string | null) => void; defaultModel: string; label: string }) {
  const { data, isFetching } = useModels(provider);
  const models = useMemo(() => data?.models ?? [], [data]);
  const selected: ModelOption | null = value ? (models.find((m) => m.id === value) ?? { id: value, name: value }) : null;

  return (
    <Combobox<ModelOption>
      id={id}
      aria-label={label}
      value={selected}
      onChange={(m) => onChange(m?.id ?? null)}
      search={(q) => filterByQuery(models, q, (m) => `${m.name} ${m.id}`)}
      getKey={(m) => m.id}
      getLabel={(m) => m.id}
      creatable
      onCreate={(q) => ({ id: q.trim(), name: q.trim() })}
      placeholder={`Default · ${defaultModel}`}
      emptyText={isFetching ? "Loading models…" : "No matching models — type an id to use it"}
      renderItem={(m) => (
        <span className="flex min-w-0 items-center gap-3">
          <span className="min-w-0 flex-1">
            <span className="block truncate">{m.name}</span>
            {m.name !== m.id && <span className="block truncate font-mono text-caption text-fg-3">{m.id}</span>}
          </span>
          {ctx(m.contextLength) && <span className="shrink-0 text-caption text-fg-4 tabular-nums">{ctx(m.contextLength)}</span>}
        </span>
      )}
    />
  );
}
