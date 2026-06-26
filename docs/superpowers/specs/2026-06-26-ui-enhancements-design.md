# Design: UI Enhancements (Subsystem 4)

**Date:** 2026-06-26
**Status:** Approved (design phase) — all product decisions confirmed in `docs/PRD.md` §7.
**Covers:** Four UI features layered on the existing playground + Learn mode: (1) lesson progress, (2) consistent navigation, (3) an infra flow-diagram board, (4) part detail panels. Builds on the simulation core and curriculum subsystems.

---

## 1. Principles

- **Pure logic stays headless and tested.** New derived data (lesson position, navigation state transitions, the flow-diagram model) lives in pure functions with unit tests. Only `src/main.ts` touches the DOM.
- **Reuse the engine.** The infra board's diagnostic states come from `evaluateBuild`/`evaluateAgainstWorkload` metrics + violations — no new rules.
- **Self-contained.** All visuals are inline SVG/HTML; external "Learn more" links open in a new tab but nothing else leaves the page.

---

## 2. Feature 1 — Lesson progress

**Goal:** Replace the bare header "%" with clear, layered progress: where you are in the current lesson *and* in the whole course.

**Display (top of the lesson panel):**
- Breadcrumb: `Module title › Lesson title`.
- `Step N of M` for the current (viewed) block within its lesson.
- A thin **per-lesson bar** filled to the viewed step.
- A slim **overall-course bar** (kept in the header) using existing `courseProgressPct`.

**New pure helper (in `src/curriculum/progress.ts`):**
```ts
export interface LessonPosition {
  moduleTitle: string;
  lessonTitle: string;
  stepIndex: number;  // 0-based index of the block within its lesson
  stepCount: number;  // total blocks in that lesson
}
export function locateBlock(course: Course, blockId: string): LessonPosition | null;
```
Returns `null` if the id is not found. Pure; unit-tested.

## 3. Feature 2 — Consistent navigation

**Goal:** A fixed `← Previous … Next →` footer in the same place on every block, with a learning-appropriate gating model.

**State model — two pointers:**
- **Progress pointer** (persisted): `progress.completedBlockIds` — how far the learner has *gotten*.
- **View pointer** (in-memory UI state): `viewIndex` — which block in `flattenBlocks(course)` is being *shown*. Resets to the frontier block on load and on mode switch.

Definitions:
- `frontierIndex` = index of `currentBlock(course, progress)` (the first incomplete block). If the course is complete, the lesson panel shows the completion screen and the footer is hidden.
- The learner may view any block from `0` through `frontierIndex` (inclusive). Blocks beyond the frontier are locked.

**A block is "satisfied" when:**
- `teach` → always.
- `task` / `challenge` → `checkSuccess(block.successCheck, build, block)` is true.
- `reflect` → the correct quiz option has been selected (tracked per-block in UI state).

**Footer behavior:**
- **Previous:** enabled when `viewIndex > 0`; decrements `viewIndex`.
- **Next:**
  - If `viewIndex < frontierIndex` (reviewing a completed block): always enabled; increments `viewIndex` (moves back toward the frontier).
  - If `viewIndex === frontierIndex` (at the frontier): enabled only when the block is **satisfied**. On click: `progress = completeBlock(progress, block.id)` (persist), then `viewIndex++`.
- The inline "Got it / Continue" buttons are **removed** — advancement is solely via the footer Next, keeping controls in one consistent place. The reflect quiz options stay interactive (to answer). A `✓ requirement met` cue and the **Hint** button remain in the block body for task/challenge.

**Edge cases:**
- Reviewing a completed block whose requirement the current build no longer meets does **not** re-lock it (it's already completed).
- The Hint button still computes a bottleneck-keyed hint for the viewed task/challenge block.

## 4. Feature 3 — Infra board (schematic flow diagram)

**Goal:** A full-width board that shows the build as a color-coded flow diagram *and* doubles as a live diagnostic.

**Representation:** **grouped by type** — one node per category present, not per component (readable at any scale).

**Pure model (new `src/ui/flow.ts`, unit-tested):**
```ts
export type FlowNodeId = "power" | "compute" | "network" | "cooling";
export type FlowKind = "power" | "network" | "heat";

export interface FlowNode {
  id: FlowNodeId;
  label: string;       // e.g. "Power", "Compute"
  stat: string;        // e.g. "120 / 90 kW", "8 chips · 8000 tok/s"
  status: "ok" | "alert";
  alert?: string;      // short reason, e.g. "under-powered"
}
export interface FlowEdge {
  from: FlowNodeId;
  to: FlowNodeId;
  kind: FlowKind;
  status: "ok" | "alert";
}
export interface FlowModel { nodes: FlowNode[]; edges: FlowEdge[]; }

export function buildFlowModel(build: Build, metrics: Metrics): FlowModel;
```

**Node inclusion** (only categories present in the build):
- `power` — stat `supplyKW / drawKW`. `alert` when `metrics.power.deficitKW > 0` ("under-powered").
- `compute` — present if any accelerators/servers. stat `N chips · <throughput>`. `alert` when there are compute parts but **no** power node ("no power").
- `network` — present if any network parts. stat `Gbps · clustered|not clustered`.
- `cooling` — present if any cooling parts. stat `removalKW`. `alert` when `metrics.thermal.deficitKW > 0` ("overheating").

**Edges** (only when both endpoints present):
- `power → compute` (kind `power`); `power → cooling`; `power → network`.
- `network ↔ compute` (kind `network`) — `status: "alert"` (dashed-red) when there are ≥2 accelerators and `!metrics.network.clusterConnected`.
- `compute → cooling` (kind `heat`) — `status: "alert"` when overheating.

**Rendering (in `src/main.ts`):** an inline SVG. Fixed, simple layout — Power left, Compute center, Network upper-right, Cooling lower-right. Each node is a rounded box containing its category icon (reuse `iconFor`-style art), label, and stat; alert nodes get a red border + the alert reason. Edges are lines colored by kind — ⚡ power = yellow (`#f2c744`), network = blue (`#4ea1ff`), heat = red (`#f85149`) — alert edges are dashed and red. A small legend maps color → flow.

**Placement:** a new full-width `.panel` (`#board`) below the three working columns. Empty state: "Add parts to see your data center take shape."

## 5. Feature 4 — Part detail panel

**Goal:** Let players inspect any shelf part — what it is, its specs/cost, and a link to learn more — without it getting in the way of building.

**Catalog schema additions** (`src/sim/types.ts` → `ComponentType`):
```ts
description?: string;   // 1–2 plain-language sentences
learnMoreUrl?: string;  // Wikipedia / neutral reference page
```
**Every catalog entry gets both populated.** Link source = **Wikipedia / reference pages** (neutral, stable, no marketing). Examples:
- `gpu-nvidia-h100` → description: "NVIDIA's flagship data-center GPU for AI. Very fast at both training and serving, but power-hungry (~700W) and expensive." · `https://en.wikipedia.org/wiki/Hopper_(microarchitecture)`
- `acc-aws-trainium` → "Amazon's custom chip built specifically for *training* models cheaply — great at training, weak for serving." · `https://en.wikipedia.org/wiki/AWS_Trainium`
- `cooling-crac` → "A Computer Room Air Conditioner — moves heat out of the room so the chips don't cook." · `https://en.wikipedia.org/wiki/Computer_room_air_conditioning`

(The implementation plan will list the description + URL for all ~16 entries. URLs are author-curated; if a precise page doesn't exist, link the closest relevant concept.)

**Interaction:**
- Each shelf item shows a small **ⓘ button** distinct from the body. The body click still **adds** the part; the ⓘ click **opens the detail panel** (and does not add).
- The detail panel is a **right-side slide-over** (`position: fixed`, full height, ~320px, scrollable) over a dimmed backdrop. Click the backdrop or a ✕ to close. `Esc` also closes.

**Panel content:** large icon, name + vendor, the description, a specs table (the `specs` entries with friendly labels where easy, plus Power, Heat, Capex), and a **"Learn more ↗"** link (`target="_blank" rel="noopener noreferrer"`).

**Security note:** descriptions and URLs are author-controlled catalog data (not user input), so rendering them is safe; the external link still uses `rel="noopener noreferrer"`.

---

## 6. New / changed files

- `src/curriculum/progress.ts` — add `locateBlock` + `LessonPosition`.
- `src/curriculum/__tests__/progress.test.ts` — tests for `locateBlock`.
- `src/ui/flow.ts` — new; `buildFlowModel` + types.
- `src/ui/__tests__/flow.test.ts` — new; flow-model + diagnostic tests.
- `src/sim/types.ts` — add `description?`, `learnMoreUrl?` to `ComponentType`.
- `src/sim/catalog.ts` — populate description + learnMoreUrl for all entries.
- `src/sim/__tests__/catalog.test.ts` — assert every entry has both fields and a valid-looking URL.
- `index.html` — footer nav, progress bar, board panel, detail-panel markup + styles.
- `src/main.ts` — view-pointer nav, progress display, board SVG render, detail panel, ⓘ buttons.

## 7. Testing

- `locateBlock`: returns correct module/lesson titles, step index, and count for first/middle/last blocks; `null` for unknown id.
- Navigation: pure state transitions can be unit-tested via a small helper if extracted, but the gating (Previous/Next enablement) is primarily verified by running the app; the *satisfied* predicate reuses already-tested `checkSuccess`.
- `buildFlowModel`: node presence by category; power/heat/network edges present when endpoints exist; alert states for power deficit, overheating, and un-clustered multi-GPU; "no power" compute alert.
- Catalog: every entry has non-empty `description` and an `https://` `learnMoreUrl`.

## 8. Success criteria

1. Every lesson block shows `Module › Lesson`, `Step N of M`, a per-lesson bar, and a course bar.
2. A fixed `← Previous / Next →` footer behaves per the free-review/gated-forward model; inline advance buttons are gone.
3. The infra board renders a grouped-by-type, color-coded flow diagram that turns red on power/cooling/cluster problems, with an empty state.
4. Each shelf part has an ⓘ that opens a side panel with description, specs, cost, and a working Wikipedia "Learn more" link; the body click still adds.
5. All new pure logic is unit-tested; `npm test` and `npm run typecheck` pass.
