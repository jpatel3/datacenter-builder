import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/** The Supabase client, or null when env vars are absent (local-only mode). */
export const supabase: SupabaseClient | null = url && key ? createClient(url, key) : null;

export function isConfigured(): boolean {
  return !!supabase;
}
