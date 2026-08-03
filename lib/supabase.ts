import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

let browserClient: SupabaseClient<Database> | null = null;

export function isSupabaseConfigured() {
  return Boolean(
    process.env.VITE_SUPABASE_URL &&
      process.env.VITE_SUPABASE_PUBLISHABLE_KEY,
  );
}

export function getSupabaseBrowserClient() {
  if (browserClient) return browserClient;

  const url = process.env.VITE_SUPABASE_URL;
  const publishableKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !publishableKey) {
    throw new Error("Supabase belum dikonfigurasi.");
  }

  browserClient = createClient(url, publishableKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });

  return browserClient;
}
