"use client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { QuickExtractInput, QuickSaveInput } from "@/app/api/import/quick/schema";
import type { QuickExtractResult, QuickSaveResult } from "@/lib/data/import-quick";
import { importKeys, invalidateNetwork } from "./import-review";

export type { QuickExtractResult, QuickSaveResult };
export type QuickPerson = QuickExtractResult["people"][number];

/** Pasted text → extracted people with match suggestions (no writes). */
export function useQuickExtract() {
  return useMutation({
    retry: false,
    mutationFn: (body: QuickExtractInput) => api.post<QuickExtractResult>("/api/import/quick", body),
  });
}

/** Saves the reviewed paste (commit path of the import pipeline). */
export function useQuickSave() {
  const qc = useQueryClient();
  return useMutation({
    retry: false,
    mutationFn: (body: QuickSaveInput) => api.post<QuickSaveResult>("/api/import/quick/save", body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: importKeys.all });
      invalidateNetwork(qc);
    },
  });
}
