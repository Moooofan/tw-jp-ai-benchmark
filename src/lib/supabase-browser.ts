"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | null = null;

/** Singleton browser client. Cookie-backed, so the server can read the session. */
export function getBrowserClient(): SupabaseClient {
  if (!client) {
    client = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    );
  }
  return client;
}

/** Turns a Postgres `raise exception` into the short zh-TW line the UI shows. */
export function errText(error: unknown): string {
  const raw =
    typeof error === "object" && error !== null && "message" in error
      ? String((error as { message: unknown }).message)
      : String(error);
  const cleaned = raw.trim();
  if (!cleaned) return "怪怪的，再試一次。";
  if (/failed to fetch|networkerror|load failed/i.test(cleaned)) {
    return "網路怪怪的，再試一次。";
  }
  return cleaned;
}
