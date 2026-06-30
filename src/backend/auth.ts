import { supabase } from "./supabase";
import type { User } from "@supabase/supabase-js";

export async function signInWithGitHub(): Promise<void> {
  await supabase?.auth.signInWithOAuth({
    provider: "github",
    options: { redirectTo: window.location.href.split("?")[0] },
  });
}

export async function signOut(): Promise<void> {
  await supabase?.auth.signOut();
}

export async function getUser(): Promise<User | null> {
  if (!supabase) return null;
  const { data } = await supabase.auth.getUser();
  return data.user ?? null;
}

export function onAuthChange(cb: (user: User | null) => void): void {
  supabase?.auth.onAuthStateChange((_event, session) => cb(session?.user ?? null));
}
