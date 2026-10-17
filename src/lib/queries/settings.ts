"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { AiConnectionView, UiAiProvider } from "@/lib/connections/ai";
import type { AiTestResult } from "@/lib/connections/ai-test";
import type { EmailConnectionView, UiEmailProvider } from "@/lib/connections/email";
import type { EmailTestResult } from "@/lib/connections/email-test";
import type { ModelList, ModelProvider } from "@/lib/connections/models";
import type { SetupStatus } from "@/lib/connections/setup-status";
import type { CategoryInput } from "@/lib/schemas";
import type { LocationInput } from "@/lib/schemas";
import { keys } from "./keys";
import type { Category, ProfileDetail, Taxonomy } from "./types";

/**
 * Settings: profile, connections (AI + e-mail), setup checklist, digest preview, categories.
 * Keys live here (keys.ts is shared and frozen); they all start with "settings" except the
 * profile and categories, which other screens read too.
 */
export const settingsKeys = {
  all: ["settings"] as const,
  ai: () => ["settings", "connections", "ai"] as const,
  email: () => ["settings", "connections", "email"] as const,
  models: (provider: ModelProvider) => ["settings", "models", provider] as const,
  setup: () => ["settings", "setup"] as const,
};

/* ---------- profile ---------- */

export type ProfilePatch = { displayName?: string | null; timezone?: string; digestHour?: number; digestEnabled?: boolean; homeLocation?: LocationInput | null };

export function useProfile() {
  return useQuery({ queryKey: keys.profile(), queryFn: () => api.get<ProfileDetail>("/api/profile"), staleTime: 5 * 60_000 });
}

export function useUpdateProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: ProfilePatch) => api.patch<ProfileDetail>("/api/profile", patch),
    onMutate: async (patch) => {
      // Optimistic for the simple fields so switches and pickers feel instant.
      await qc.cancelQueries({ queryKey: keys.profile() });
      const previous = qc.getQueryData<ProfileDetail>(keys.profile());
      if (previous) {
        const { homeLocation: _ignored, ...simple } = patch;
        qc.setQueryData<ProfileDetail>(keys.profile(), { ...previous, ...(simple as Partial<ProfileDetail>) });
      }
      return { previous };
    },
    onError: (_err, _patch, ctx) => {
      if (ctx?.previous) qc.setQueryData(keys.profile(), ctx.previous);
    },
    onSuccess: (data) => {
      qc.setQueryData(keys.profile(), data);
      qc.invalidateQueries({ queryKey: keys.globe() });
      qc.invalidateQueries({ queryKey: keys.stats() });
    },
  });
}

/* ---------- connections ---------- */

export type SaveAiBody = { provider: UiAiProvider; apiKey?: string; mainModel?: string | null; fastModel?: string | null };
export type SaveEmailBody = {
  provider: UiEmailProvider;
  from?: string | null;
  apiKey?: string;
  smtp?: { host?: string | null; port?: number | null; secure?: boolean; user?: string | null; pass?: string };
};

export function useAiConnection() {
  return useQuery({ queryKey: settingsKeys.ai(), queryFn: () => api.get<AiConnectionView>("/api/settings/connections/ai"), staleTime: 30_000 });
}

export function useEmailConnection() {
  return useQuery({ queryKey: settingsKeys.email(), queryFn: () => api.get<EmailConnectionView>("/api/settings/connections/email"), staleTime: 30_000 });
}

export function useSaveAiConnection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: SaveAiBody) => api.put<AiConnectionView>("/api/settings/connections/ai", body),
    retry: 0,
    networkMode: "always",
    onSuccess: (view) => {
      qc.setQueryData(settingsKeys.ai(), view);
      qc.invalidateQueries({ queryKey: settingsKeys.setup() });
      // A new Anthropic key unlocks the live model list.
      qc.invalidateQueries({ queryKey: ["settings", "models"] });
    },
  });
}

export function useSaveEmailConnection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: SaveEmailBody) => api.put<EmailConnectionView>("/api/settings/connections/email", body),
    retry: 0,
    networkMode: "always",
    onSuccess: (view) => {
      qc.setQueryData(settingsKeys.email(), view);
      qc.invalidateQueries({ queryKey: settingsKeys.setup() });
    },
  });
}

export function useTestAiConnection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<AiTestResult>("/api/settings/connections/ai/test"),
    retry: 0,
    networkMode: "always",
    onSettled: () => {
      qc.invalidateQueries({ queryKey: settingsKeys.ai() });
      qc.invalidateQueries({ queryKey: settingsKeys.setup() });
    },
  });
}

export function useTestEmailConnection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<EmailTestResult>("/api/settings/connections/email/test"),
    retry: 0,
    networkMode: "always",
    onSettled: () => {
      qc.invalidateQueries({ queryKey: settingsKeys.email() });
      qc.invalidateQueries({ queryKey: settingsKeys.setup() });
    },
  });
}

export function useModels(provider: ModelProvider | null) {
  return useQuery({
    queryKey: settingsKeys.models(provider ?? "openrouter"),
    queryFn: () => api.get<ModelList>(`/api/settings/models?provider=${provider}`),
    enabled: !!provider,
    staleTime: 60 * 60_000,
  });
}

/* ---------- setup + digest ---------- */

export function useSetupStatus() {
  return useQuery({ queryKey: settingsKeys.setup(), queryFn: () => api.get<SetupStatus>("/api/setup/status"), staleTime: 60_000 });
}

export function useSendDigestPreview() {
  return useMutation({
    mutationFn: () => api.post<{ ok: boolean; to?: string; error?: string }>("/api/settings/digest/test"),
    retry: 0,
    networkMode: "always",
  });
}

/* ---------- categories ---------- */

export type CategoryRow = Category & { count?: number };

function useInvalidateCategories() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: keys.categories() });
    qc.invalidateQueries({ queryKey: keys.taxonomy() });
    qc.invalidateQueries({ queryKey: ["people"] });
    qc.invalidateQueries({ queryKey: ["person"] });
  };
}

export function useCreateCategory() {
  const done = useInvalidateCategories();
  return useMutation({ mutationFn: (input: CategoryInput) => api.post<Category>("/api/categories", input), retry: 0, onSuccess: done });
}

export function useUpdateCategory() {
  const done = useInvalidateCategories();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Partial<CategoryInput> }) => api.patch<Category>(`/api/categories/${id}`, patch),
    retry: 0,
    onSuccess: done,
  });
}

export function useDeleteCategory() {
  const done = useInvalidateCategories();
  return useMutation({ mutationFn: (id: string) => api.delete(`/api/categories/${id}`), retry: 0, onSuccess: done });
}

export function useReorderCategories() {
  const qc = useQueryClient();
  const done = useInvalidateCategories();
  return useMutation({
    mutationFn: (ids: string[]) => api.post<CategoryRow[]>("/api/settings/categories/reorder", { ids }),
    onMutate: (ids) => {
      const previous = qc.getQueryData<Category[]>(keys.categories());
      if (previous) {
        const order = new Map(ids.map((id, i) => [id, i]));
        qc.setQueryData<Category[]>(
          keys.categories(),
          [...previous].sort((a, b) => (order.get(a.id) ?? 1e9) - (order.get(b.id) ?? 1e9)).map((c, i) => ({ ...c, sort: i + 1 })),
        );
      }
      return { previous };
    },
    onError: (_e, _ids, ctx) => {
      if (ctx?.previous) qc.setQueryData(keys.categories(), ctx.previous);
    },
    onSuccess: (rows) => {
      // The response carries counts, i.e. exactly the taxonomy's category rows.
      qc.setQueryData<Taxonomy>(keys.taxonomy(), (old) => (old ? { ...old, categories: rows as Taxonomy["categories"] } : old));
    },
    onSettled: done,
  });
}
