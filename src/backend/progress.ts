import { supabase } from "./supabase";

export async function loadCloudProgress(userId: string): Promise<string[]> {
  if (!supabase) return [];
  const { data } = await supabase
    .from("progress")
    .select("completed_block_ids")
    .eq("user_id", userId)
    .maybeSingle();
  return (data?.completed_block_ids as string[]) ?? [];
}

export async function saveCloudProgress(userId: string, ids: string[]): Promise<void> {
  if (!supabase) return;
  await supabase
    .from("progress")
    .upsert({ user_id: userId, completed_block_ids: ids, updated_at: new Date().toISOString() });
}
