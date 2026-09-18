"use client";
import { createBrowserClient } from "@supabase/ssr";
import { clientEnv } from "@/lib/env";

let browserClient: ReturnType<typeof createBrowserClient> | null = null;

export function supabaseBrowser() {
  if (!browserClient) {
    browserClient = createBrowserClient(clientEnv.NEXT_PUBLIC_SUPABASE_URL, clientEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  }
  return browserClient;
}
