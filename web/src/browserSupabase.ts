"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

let cached: { url: string; key: string; client: SupabaseClient } | null = null;

export function browserSupabase(url: string, key: string): SupabaseClient {
  if (!cached || cached.url !== url || cached.key !== key) {
    cached = { url, key, client: createBrowserClient(url, key) };
  }
  return cached.client;
}
