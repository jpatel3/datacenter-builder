import { supabase } from "./supabase";
import type { Build } from "../sim";

export interface BuildRow {
  id: string;
  name: string;
  build_json: Build;
  metrics_snapshot: unknown;
  is_public: boolean;
  updated_at: string;
}

export async function saveBuild(
  name: string,
  build: Build,
  metrics: unknown,
  ownerId: string,
): Promise<BuildRow | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from("builds")
    .insert({ name, build_json: build, metrics_snapshot: metrics, owner_id: ownerId })
    .select()
    .single();
  if (error) throw error;
  return (data as BuildRow) ?? null;
}

export async function listMyBuilds(): Promise<BuildRow[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("builds")
    .select("*")
    .order("updated_at", { ascending: false });
  if (error) throw error;
  return (data as BuildRow[]) ?? [];
}

export async function deleteBuild(id: string): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase.from("builds").delete().eq("id", id);
  if (error) throw error;
}

export async function setPublic(id: string, isPublic: boolean): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase.from("builds").update({ is_public: isPublic }).eq("id", id);
  if (error) throw error;
}

export async function getPublicBuild(id: string): Promise<BuildRow | null> {
  if (!supabase) return null;
  const { data } = await supabase.from("builds").select("*").eq("id", id).maybeSingle();
  return (data as BuildRow) ?? null;
}

/** Fork = save a copy owned by the current user. */
export async function forkBuild(
  name: string,
  build: Build,
  metrics: unknown,
  ownerId: string,
): Promise<BuildRow | null> {
  return saveBuild(name, build, metrics, ownerId);
}
