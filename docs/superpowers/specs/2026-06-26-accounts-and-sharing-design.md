# Design: Accounts, Persistence & Sharing (Subsystem 8)

**Date:** 2026-06-26
**Status:** Approved (design phase). Decisions: **GitHub** social sign-in; scope = save/load/delete builds + public share link & fork + course-progress sync; backend = **Supabase** (user provisions the project first).
**Builds on:** the curriculum & sharing structure in `2026-06-26-curriculum-and-sharing-design.md`.

---

## 1. Scope

1. **Auth** — sign in / out with **GitHub** (Supabase OAuth).
2. **My builds** — name & save the current build to the cloud; list, reload, delete.
3. **Share** — make a saved build public → a share link → a read-only view anyone can open and **"fork into my playground."**
4. **Progress sync** — store Learn-mode progress on the account so it follows the user across devices.

**Graceful degradation:** when Supabase env vars are absent or the user is signed out, the app behaves exactly as today (localStorage for progress, in-memory build). Cloud features light up only when configured + signed in.

## 2. Tech & dependencies

- **`@supabase/supabase-js`** (new dependency) for auth + Postgres.
- **Vite env vars:** `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (in `.env`, gitignored; `.env.example` committed). The anon key is a public client key — safe to ship; security is enforced by Row-Level Security (RLS), not key secrecy. No service-role key ever goes in the client.
- **Share routing:** query-param on the existing SPA — `?build=<id>` opens the read-only share view. No router library needed.

## 3. Data model (Postgres)

```sql
create table if not exists public.builds (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  build_json jsonb not null,
  metrics_snapshot jsonb,
  is_public boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.progress (
  user_id uuid primary key references auth.users(id) on delete cascade,
  completed_block_ids text[] not null default '{}',
  updated_at timestamptz not null default now()
);
```

The build's `id` (uuid) **is** the public share identifier (`?build=<id>`); no separate slug table in v1.

## 4. Row-Level Security (the access rules)

```sql
alter table public.builds enable row level security;
create policy "read own builds"    on public.builds for select using (auth.uid() = owner_id);
create policy "read public builds" on public.builds for select using (is_public = true);
create policy "insert own builds"  on public.builds for insert with check (auth.uid() = owner_id);
create policy "update own builds"  on public.builds for update using (auth.uid() = owner_id);
create policy "delete own builds"  on public.builds for delete using (auth.uid() = owner_id);

alter table public.progress enable row level security;
create policy "own progress" on public.progress for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
```

- Owners read/write only their own rows.
- **Public rows are world-readable** (incl. signed-out visitors) — that's what powers the share view.
- **Fork** = the viewer inserts a *new* row owned by themselves (copying `build_json`); the original is never mutated, enforced by the insert policy.

## 5. Auth flow

- `signInWithOAuth({ provider: "github", options: { redirectTo: window.location.origin } })`.
- `supabase.auth.onAuthStateChange` updates the UI (signed-in shows avatar/name + Sign out; signed-out shows "Sign in with GitHub").
- `signOut()` returns to local mode.
- On first sign-in, if the user has local progress further than their cloud progress, offer to **push local progress up** (one-time merge: union of completed block ids).

## 6. Module structure (headless backend; DOM only in main.ts)

```
src/backend/
  supabase.ts    // creates the client from env; isConfigured(): boolean
  auth.ts        // signInWithGitHub(), signOut(), getUser(), onAuthChange(cb)
  builds.ts      // saveBuild, listMyBuilds, loadBuild, deleteBuild,
                 // setPublic(id, bool), getPublicBuild(id), forkBuild(id)
  progress.ts    // loadCloudProgress(), saveCloudProgress(ids) — with local fallback
  share.ts       // shareUrlFor(id), parseShareParam() — PURE, unit-tested
```

Types reuse `Build`/`Progress` from existing modules. `build_json` stores the `Build`; `metrics_snapshot` stores a small subset of `evaluateBuild` output for list previews (recomputed on load).

## 7. UI changes (`main.ts` + `index.html`)

- **Header auth control:** "Sign in with GitHub" button → avatar + name + "Sign out" when authed.
- **My Builds** (left column, under "Your build", only when signed in): a **Save** button (prompts for a name), and a list of saved builds with **Load / Share / Delete** actions. Share toggles `is_public` and copies the `?build=<id>` link.
- **Share view** (`?build=<id>`): a read-only screen showing the build name, its infra board + metrics, and **"Fork into my playground"** (requires sign-in) + "Open the builder." Reuses the board/readout renderers.
- **Progress sync:** when signed in, progress loads from / saves to the cloud instead of localStorage (localStorage remains the signed-out fallback and the migration source).

## 8. Security notes

- Anon key is public by design; RLS is the real boundary. Verified by the policies in §4.
- No service-role key in the client; no secrets committed (`.env` gitignored).
- External/share links rendered with `rel="noopener noreferrer"`; share content is the owner's own `build_json` (structured data, not arbitrary HTML).

## 9. Testing

- **Pure units (`share.ts`):** `shareUrlFor(id)` builds the correct `?build=` URL; `parseShareParam()` extracts the id (and returns null when absent/malformed).
- Backend data calls are integration-tested **live** by the user against their Supabase project (network + auth can't be meaningfully unit-tested here). Existing 63 tests + typecheck must stay green.
- Manual verification checklist: sign in, save, reload, list, make public, open share link in a private window, fork, delete; progress persists across devices.

## 10. Supabase setup checklist (user-provisioned)

1. Create a free Supabase project; copy **Project URL** + **anon public key**.
2. **Auth → Providers → GitHub:** enable; create a GitHub OAuth App with callback `https://<project-ref>.supabase.co/auth/v1/callback`; paste its Client ID/Secret into Supabase.
3. **Auth → URL configuration:** Site URL + redirect URLs include the dev origin (`http://localhost:5174`) and any deploy origin.
4. **SQL editor:** run the schema (§3) + RLS (§4).
5. Provide the URL + anon key → added to `.env` as `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`.

## 11. Success criteria

1. Signed-out app works exactly as today (no regressions; 63 tests green).
2. GitHub sign-in/out works; UI reflects auth state.
3. Save/list/load/delete own builds; RLS blocks access to others' private builds.
4. Make public → share link → read-only view loads for a signed-out visitor → fork creates a new owned copy.
5. Course progress syncs to the account and restores on another device/session.
6. No secrets committed; `share.ts` unit-tested; typecheck clean.
