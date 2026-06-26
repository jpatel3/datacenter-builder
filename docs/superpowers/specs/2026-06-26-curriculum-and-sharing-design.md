# Design: Data Center Builder — Curriculum & Sharing

**Date:** 2026-06-26
**Status:** Design captured (not yet scheduled for implementation)
**Covers:** Subsystem 3 (curriculum / campaign) and the save/restore/share half of Subsystem 4. Builds on the simulation core (`2026-06-26-simulation-core-design.md`), which is implemented first.

---

## 1. Principle

The curriculum is **declarative data layered on top of the sim engine.** Every guided-step completion check and every challenge grade calls the *same* `evaluateBuild` / `evaluateAgainstWorkload` from the simulation core. There is no second copy of the rules — the engine is the single source of truth, and lessons just reference its outputs.

## 2. Content hierarchy

`Course → Module → Lesson → Block`. The **Block** is the atomic step in guided mode.

### Block types

| Type | Purpose | Completion check |
|---|---|---|
| **Teach** | Explain one concept (text + small diagram); no build action. | Advance |
| **Task** | One concrete grid action ("place a rack", "add an H100 server", "connect power"). | A predicate over build/metrics |
| **Challenge** | A full mini-scenario: meet a workload under a budget. | `evaluateAgainstWorkload().passed` |
| **Reflect** | Check-for-understanding question. | Answer selected |

### Block as data

```ts
interface Block {
  id: string;
  type: "teach" | "task" | "challenge" | "reflect";
  content: { title: string; body: string; diagram?: string };
  unlocks?: string[];            // component type ids made available at/after this block
  workload?: Workload;           // for challenge blocks (from sim core)
  budgetUSD?: number;            // optional cost cap for challenge blocks
  successCheck?: SuccessCheck;   // for task/challenge blocks
  hints?: HintRule[];            // shown on request or when stuck
}
```

### Composable success checks (reference engine outputs)

```ts
type SuccessCheck =
  | { require: "componentCount"; category: Category; min: number }
  | { require: "connected"; kind: "power" | "network" }
  | { require: "noViolations" }
  | { require: "metricAtLeast"; path: string; value: number }   // e.g. "compute.inferenceThroughput"
  | { require: "workloadPassed" }
  | { all: SuccessCheck[] } | { any: SuccessCheck[] };
```

### Hints keyed to bottleneck

```ts
interface HintRule { when?: Bottleneck; text: string }
```

Because `evaluateAgainstWorkload` returns the limiting `bottleneck`, a stuck player gets a targeted hint automatically (e.g. `power-deficit → "You're power-limited — add supply or a bigger feed."`). This is the guided-mode safety net.

## 3. Sample campaign progression

1. **Anatomy of a server** — place GPU → CPU → server → rack; learn watts & heat.
2. **Keep it alive** — power supply and cooling must meet demand; fix a power deficit, then overheating.
3. **Make it a cluster** — add networking; experience the training-vs-inference divergence (identical accelerators, different interconnect → training throughput collapses, inference is fine).
4. **Cost & affordability** — capex vs opex, $/M tokens; compare GPU A vs B per dollar.
5. **Real builds** — reverse-engineer GPT-3-class and DeepSeek-V3 infrastructure; then the BharatGen affordability challenge. (Estimated figures labeled per the sim-core honesty rule.)
6. **Sandbox unlocks** — open playground becomes available.

Modes: **Guided course mode** (this progression, blocks gating component unlocks) and **Open exploration / sandbox** (all components, free build), sharing the same grid + engine.

## 4. Playground

The sandbox is the same grid and engine with all components unlocked and no enforced workload; the player may optionally select any `Workload` to live-test a build against. No grading, full freedom — the destination the campaign leads to.

## 5. Save / restore / share

A build is already plain serializable JSON (sim-core spec), so persistence is thin.

**Storage (Supabase Postgres):**
```
builds(
  id uuid pk, owner_id uuid fk -> auth.users,
  name text, build_json jsonb, metrics_snapshot jsonb,
  is_public boolean default false, share_slug text unique,
  created_at, updated_at
)
```

**Save/restore:** owner CRUD on their builds; `metrics_snapshot` stored alongside so a list view shows cost/capacity without re-running the engine (the engine still re-validates on open).

**Sharing — public link + fork-to-edit (decided):**
- Setting `is_public = true` mints a `share_slug` → a read-only public page rendering the build and its metrics.
- Anyone (including logged-out viewers) can view; a logged-in viewer can **"Fork into my playground"** — copies `build_json` into a new build they own and can edit. The original is never mutated.
- Row-level security: owners read/write their rows; public rows are world-readable; forking inserts a brand-new row owned by the forker.

(A lightweight URL-encoded share could be added later as a logged-out fallback, but is out of scope for v1.)

## 6. Boundaries / sequencing

- Implemented **after** the simulation core. The canvas/building UX (subsystem 2) is needed before guided Task blocks are playable end-to-end.
- This doc intentionally specifies content *structure*, not the full lesson copy; actual lesson text/diagrams are authored as data once the engine + canvas exist.
- Auth mechanics (Supabase social sign-in setup) are the other half of subsystem 4 and will get their own short spec.
