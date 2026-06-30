# Accounts, Save & Share — Implementation Plan

> REQUIRED SUB-SKILL: executing-plans. Steps use checkbox syntax.

**Goal:** GitHub sign-in, save/load/delete cloud builds, public share link + fork, and course-progress sync — layered on the existing app, gracefully degrading to local-only when signed out or unconfigured.

**Architecture:** Headless `src/backend/*` wraps Supabase; only `main.ts` touches the DOM. `share.ts` is pure + unit-tested. Signed-out behavior is unchanged.

**Tech:** `@supabase/supabase-js`, Vite env (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`).

## Global Constraints
- No regressions signed-out; 63 existing tests stay green.
- Anon key is public (RLS is the boundary); never commit `.env`.
- External links `rel="noopener noreferrer"`.

---

### Task 1: Supabase client + pure share helpers
**Files:** create `src/backend/supabase.ts`, `src/backend/share.ts`, `src/backend/__tests__/share.test.ts`.

- `supabase.ts`: read env; export `supabase` (client or null) + `isConfigured(): boolean`.
```ts
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
export const supabase: SupabaseClient | null = url && key ? createClient(url, key) : null;
export function isConfigured(): boolean { return !!supabase; }
```
- `share.ts` (pure):
```ts
export function parseShareParam(search: string): string | null {
  const id = new URLSearchParams(search).get("build");
  return id && /^[0-9a-f-]{20,}$/i.test(id) ? id : null;
}
export function buildShareUrl(origin: string, basePath: string, id: string): string {
  const base = basePath.endsWith("/") ? basePath : basePath + "/";
  return `${origin}${base}?build=${id}`;
}
```
- Tests: valid uuid parses; missing/garbage → null; buildShareUrl joins base + id correctly.

- [ ] Write share tests → run (fail) → implement → run (pass) → commit.

---

### Task 2: Auth module
**Files:** create `src/backend/auth.ts`.
```ts
import { supabase } from "./supabase";
import type { User } from "@supabase/supabase-js";
export async function signInWithGitHub() {
  await supabase?.auth.signInWithOAuth({ provider: "github", options: { redirectTo: window.location.href.split("?")[0] } });
}
export async function signOut() { await supabase?.auth.signOut(); }
export async function getUser(): Promise<User | null> {
  if (!supabase) return null;
  const { data } = await supabase.auth.getUser();
  return data.user ?? null;
}
export function onAuthChange(cb: (user: User | null) => void): void {
  supabase?.auth.onAuthStateChange((_e, session) => cb(session?.user ?? null));
}
```
- [ ] Implement → typecheck → commit.

---

### Task 3: Builds CRUD + sharing/fork
**Files:** create `src/backend/builds.ts`.
```ts
import { supabase } from "./supabase";
import type { Build } from "../sim";
export interface BuildRow { id: string; name: string; build_json: Build; metrics_snapshot: unknown; is_public: boolean; updated_at: string; }

export async function saveBuild(name: string, build: Build, metrics: unknown, ownerId: string): Promise<BuildRow | null> {
  const { data } = await supabase!.from("builds").insert({ name, build_json: build, metrics_snapshot: metrics, owner_id: ownerId }).select().single();
  return (data as BuildRow) ?? null;
}
export async function listMyBuilds(): Promise<BuildRow[]> {
  const { data } = await supabase!.from("builds").select("*").order("updated_at", { ascending: false });
  return (data as BuildRow[]) ?? [];
}
export async function deleteBuild(id: string): Promise<void> { await supabase!.from("builds").delete().eq("id", id); }
export async function setPublic(id: string, isPublic: boolean): Promise<void> {
  await supabase!.from("builds").update({ is_public: isPublic }).eq("id", id);
}
export async function getPublicBuild(id: string): Promise<BuildRow | null> {
  const { data } = await supabase!.from("builds").select("*").eq("id", id).maybeSingle();
  return (data as BuildRow) ?? null;
}
export async function forkBuild(name: string, build: Build, metrics: unknown, ownerId: string): Promise<BuildRow | null> {
  return saveBuild(name, build, metrics, ownerId);
}
```
- [ ] Implement → typecheck → commit.

---

### Task 4: Cloud progress sync
**Files:** create `src/backend/progress.ts`.
```ts
import { supabase } from "./supabase";
export async function loadCloudProgress(userId: string): Promise<string[]> {
  const { data } = await supabase!.from("progress").select("completed_block_ids").eq("user_id", userId).maybeSingle();
  return (data?.completed_block_ids as string[]) ?? [];
}
export async function saveCloudProgress(userId: string, ids: string[]): Promise<void> {
  await supabase!.from("progress").upsert({ user_id: userId, completed_block_ids: ids, updated_at: new Date().toISOString() });
}
```
- [ ] Implement → typecheck → commit.

---

### Task 5: UI integration (main.ts + index.html)
**Files:** modify `index.html`, `src/main.ts`.
- **Header auth control** (`#auth`): "Sign in with GitHub" when signed out / `@login` + "Sign out" when in. Hidden entirely if `!isConfigured()`.
- **Auth state:** on load `getUser()` + `onAuthChange`; store `user`. On sign-in, merge local progress with cloud (union) and save up; thereafter progress reads/writes cloud (local remains fallback when signed out).
- **My Builds** (left column, signed-in only): **Save** button (prompt name → `saveBuild` with current `build` + snapshot) and a list from `listMyBuilds()` — each row: **Load** (set `build`, rewire, render), **Share** (toggle `setPublic(true)` then copy `buildShareUrl(location.origin, import.meta.env.BASE_URL, id)`), **Delete**.
- **Share view:** on init, `const sid = parseShareParam(location.search)`; if set and configured, `getPublicBuild(sid)` → load its `build_json` into state, switch to Sandbox, show a banner (`#share-banner`) "Viewing **name** — Save a copy" (Save-a-copy forks via `saveBuild` when signed in, else prompts sign-in). Clear the `?build` param after load.
- **Progress hooks:** wrap the existing `saveProgress()` so it also calls `saveCloudProgress(user.id, ...)` when signed in; on sign-in load cloud + merge.
- [ ] Implement → `npm test` + `npm run typecheck` green → run app (signed-out unchanged) → commit.

---

## Done criteria (maps to accounts spec §11)
1. Signed-out app unchanged; 63 tests green; `share.ts` tested.
2. GitHub sign-in/out reflected in UI.
3. Save/list/load/delete own builds (RLS-scoped).
4. Public link → share view loads for any visitor → save-a-copy forks.
5. Progress syncs to the account.
6. No secrets committed; typecheck clean.
