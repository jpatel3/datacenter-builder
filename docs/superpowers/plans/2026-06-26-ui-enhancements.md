# UI Enhancements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans or subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Implement Subsystem 4 — lesson progress, consistent footer navigation (free-review/gated-forward), a schematic infra flow-diagram board, and per-part detail panels with Wikipedia links.

**Architecture:** New pure logic (`locateBlock`, `buildFlowModel`, catalog fields) is unit-tested; all DOM work stays in `src/main.ts`. Board diagnostics derive from engine metrics.

**Tech Stack:** TypeScript (strict), Vitest, Vite. No new dependencies.

## Global Constraints

- Pure logic headless + tested; only `src/main.ts` touches the DOM.
- Board states come from `evaluateBuild`/`evaluateAgainstWorkload`; no duplicated rules.
- External links open with `target="_blank" rel="noopener noreferrer"`.
- `description`/`learnMoreUrl` are author-curated catalog data (Wikipedia/reference pages).

---

### Task 1: `locateBlock` (lesson position)

**Files:** Modify `src/curriculum/progress.ts`; Modify `src/curriculum/__tests__/progress.test.ts`.

**Produces:** `LessonPosition` + `locateBlock(course, blockId): LessonPosition | null`.

- [ ] **Step 1: Add failing tests** to `progress.test.ts`:

```ts
import { locateBlock } from "../progress";

describe("locateBlock", () => {
  it("returns module/lesson titles, step index, and count", () => {
    const pos = locateBlock(course, "b2")!;
    expect(pos.moduleTitle).toBe("M1");
    expect(pos.lessonTitle).toBe("L1");
    expect(pos.stepIndex).toBe(1);
    expect(pos.stepCount).toBe(3);
  });
  it("returns null for an unknown id", () => {
    expect(locateBlock(course, "nope")).toBeNull();
  });
});
```

- [ ] **Step 2: Run** — FAIL.

- [ ] **Step 3: Implement** in `progress.ts`:

```ts
export interface LessonPosition {
  moduleTitle: string;
  lessonTitle: string;
  stepIndex: number;
  stepCount: number;
}

export function locateBlock(course: Course, blockId: string): LessonPosition | null {
  for (const m of course.modules) {
    for (const l of m.lessons) {
      const idx = l.blocks.findIndex((b) => b.id === blockId);
      if (idx >= 0) {
        return { moduleTitle: m.title, lessonTitle: l.title, stepIndex: idx, stepCount: l.blocks.length };
      }
    }
  }
  return null;
}
```

- [ ] **Step 4: Run** — PASS. Export `locateBlock` + `LessonPosition` from `src/curriculum/index.ts`.

- [ ] **Step 5: Commit** — `feat(curriculum): locateBlock for lesson position`.

---

### Task 2: Catalog descriptions + learn-more links

**Files:** Modify `src/sim/types.ts`, `src/sim/catalog.ts`, `src/sim/__tests__/catalog.test.ts`.

- [ ] **Step 1: Add fields to `ComponentType`** (`types.ts`): `description?: string;` and `learnMoreUrl?: string;`.

- [ ] **Step 2: Add failing test** to `catalog.test.ts`:

```ts
it("every component has a description and an https learn-more link", () => {
  for (const c of catalog) {
    expect(c.description, c.id).toBeTruthy();
    expect(c.learnMoreUrl ?? "", c.id).toMatch(/^https:\/\//);
  }
});
```

- [ ] **Step 3: Run** — FAIL.

- [ ] **Step 4: Populate** `description` + `learnMoreUrl` on every catalog entry. Use these (Wikipedia/reference pages confirmed to exist; link the closest concept where no exact page exists):

| id | learnMoreUrl |
|----|--------------|
| gpu-nvidia-a100 | https://en.wikipedia.org/wiki/Ampere_(microarchitecture) |
| gpu-nvidia-h100 | https://en.wikipedia.org/wiki/Hopper_(microarchitecture) |
| gpu-amd-mi300x | https://en.wikipedia.org/wiki/AMD_Instinct |
| acc-aws-trainium | https://en.wikipedia.org/wiki/AI_accelerator |
| acc-aws-inferentia | https://en.wikipedia.org/wiki/AI_accelerator |
| acc-google-tpu | https://en.wikipedia.org/wiki/Tensor_Processing_Unit |
| cpu-amd-epyc | https://en.wikipedia.org/wiki/Epyc |
| server-2u | https://en.wikipedia.org/wiki/Server_(computing) |
| rack-42u | https://en.wikipedia.org/wiki/19-inch_rack |
| power-grid-feed | https://en.wikipedia.org/wiki/Electrical_grid |
| power-ups | https://en.wikipedia.org/wiki/Uninterruptible_power_supply |
| cooling-crac | https://en.wikipedia.org/wiki/Computer_room_air_conditioning |
| cooling-liquid | https://en.wikipedia.org/wiki/Computer_cooling |
| net-tor-switch | https://en.wikipedia.org/wiki/Network_switch |
| net-spine-switch | https://en.wikipedia.org/wiki/Network_switch |
| space-floor-tile | https://en.wikipedia.org/wiki/Data_center |

Descriptions are 1–2 plain-language sentences each (see implementation; e.g. H100: "NVIDIA's flagship AI data-center GPU — very fast at both training and serving, but power-hungry (~700W) and pricey.").

- [ ] **Step 5: Run** — PASS.

- [ ] **Step 6: Commit** — `feat(sim): add descriptions and learn-more links to catalog`.

---

### Task 3: `buildFlowModel` (infra board model)

**Files:** Create `src/ui/flow.ts`; Create `src/ui/__tests__/flow.test.ts`. Also add `iconForCategory` to `src/ui/icons.ts`.

**Produces:** `FlowNodeId`, `FlowKind`, `FlowNode`, `FlowEdge`, `FlowModel`, `buildFlowModel(build, metrics): FlowModel`; `iconForCategory(cat, accent?): string`.

- [ ] **Step 1: Add `iconForCategory` to `icons.ts`** (refactor `iconFor` to use it):

```ts
import type { Category, ComponentType } from "../sim";
// ...keep VENDOR_ACCENT, accentFor, SHAPES...
export function iconForCategory(cat: Category, accent = "#7aa2c2"): string {
  return `<svg viewBox="0 0 48 32" width="100%" height="100%" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" role="img">${SHAPES[cat](accent)}</svg>`;
}
export function iconFor(t: ComponentType): string {
  return `<svg viewBox="0 0 48 32" width="100%" height="100%" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" role="img" aria-label="${t.name}">${SHAPES[t.category](accentFor(t))}</svg>`;
}
```

- [ ] **Step 2: Add failing tests** `src/ui/__tests__/flow.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { buildFlowModel } from "../flow";
import { evaluateBuild } from "../../sim";
import type { Build } from "../../sim";

function build(typeIds: string[], connections: Build["connections"] = []): Build {
  return { components: typeIds.map((typeId, i) => ({ instanceId: `i${i}`, typeId, position: { x: 0, y: 0 } })), connections };
}

describe("buildFlowModel", () => {
  it("includes a node per category present and the expected edges", () => {
    const b = build(["gpu-nvidia-h100", "power-grid-feed", "cooling-crac", "net-spine-switch"],
      [{ from: "i0", to: "i1", kind: "power" }]);
    const m = buildFlowModel(b, evaluateBuild(b));
    const ids = m.nodes.map((n) => n.id).sort();
    expect(ids).toEqual(["compute", "cooling", "network", "power"]);
    const edge = (f: string, t: string) => m.edges.some((e) => e.from === f && e.to === t);
    expect(edge("power", "compute")).toBe(true);
    expect(edge("compute", "cooling")).toBe(true);
    expect(edge("network", "compute")).toBe(true);
  });

  it("flags power deficit on the power node", () => {
    const b = build(["cooling-liquid", "cooling-liquid", "cooling-liquid", "power-ups"]); // 60kW > 50kW
    const m = buildFlowModel(b, evaluateBuild(b));
    expect(m.nodes.find((n) => n.id === "power")!.status).toBe("alert");
  });

  it("flags overheating on cooling node and the heat edge", () => {
    const b = build([...Array(100).fill("gpu-nvidia-h100"), "power-grid-feed", "cooling-crac"]);
    const m = buildFlowModel(b, evaluateBuild(b));
    expect(m.nodes.find((n) => n.id === "cooling")!.status).toBe("alert");
    expect(m.edges.find((e) => e.kind === "heat")!.status).toBe("alert");
  });

  it("flags an un-clustered multi-GPU build on the compute node", () => {
    const b = build([...Array(4).fill("gpu-nvidia-h100"), "power-grid-feed", "cooling-liquid"],
      [{ from: "i0", to: "i4", kind: "power" }]);
    const m = buildFlowModel(b, evaluateBuild(b));
    expect(m.nodes.find((n) => n.id === "compute")!.status).toBe("alert");
  });

  it("is empty for an empty build", () => {
    expect(buildFlowModel({ components: [], connections: [] }, evaluateBuild({ components: [], connections: [] })).nodes).toHaveLength(0);
  });
});
```

- [ ] **Step 3: Run** — FAIL.

- [ ] **Step 4: Implement `src/ui/flow.ts`:**

```ts
import type { Build, Metrics } from "../sim";
import { catalog } from "../sim";

export type FlowNodeId = "power" | "compute" | "network" | "cooling";
export type FlowKind = "power" | "network" | "heat";
export interface FlowNode { id: FlowNodeId; label: string; stat: string; status: "ok" | "alert"; alert?: string; }
export interface FlowEdge { from: FlowNodeId; to: FlowNodeId; kind: FlowKind; status: "ok" | "alert"; }
export interface FlowModel { nodes: FlowNode[]; edges: FlowEdge[]; }

const fmt = (n: number) => (!Number.isFinite(n) ? "∞" : Math.round(n).toLocaleString("en-US"));

export function buildFlowModel(build: Build, metrics: Metrics): FlowModel {
  const idx = new Map(catalog.map((c) => [c.id, c]));
  const count = (cats: string[]) =>
    build.components.filter((c) => cats.includes(idx.get(c.typeId)?.category ?? "")).length;
  const numAcc = count(["accelerator"]);
  const hasPower = count(["power"]) > 0;
  const hasCompute = count(["accelerator", "server"]) > 0;
  const hasNetwork = count(["network"]) > 0;
  const hasCooling = count(["cooling"]) > 0;

  const nodes: FlowNode[] = [];
  if (hasPower) {
    const alert = metrics.power.deficitKW > 0;
    nodes.push({ id: "power", label: "Power", status: alert ? "alert" : "ok",
      alert: alert ? "under-powered" : undefined,
      stat: `${fmt(metrics.power.supplyKW)} / ${fmt(metrics.power.drawKW)} kW` });
  }
  if (hasCompute) {
    const unit = metrics.compute.modality === "image" ? "img/s" : "tok/s";
    let alert: string | undefined;
    if (!hasPower) alert = "no power";
    else if (numAcc >= 2 && !metrics.network.clusterConnected) alert = "not clustered";
    nodes.push({ id: "compute", label: "Compute", status: alert ? "alert" : "ok", alert,
      stat: `${numAcc} chips · ${fmt(metrics.compute.inferenceThroughput)} ${unit}` });
  }
  if (hasNetwork) {
    nodes.push({ id: "network", label: "Network", status: "ok",
      stat: `${fmt(metrics.network.bisectionGbps)} Gbps · ${metrics.network.clusterConnected ? "clustered" : "not clustered"}` });
  }
  if (hasCooling) {
    const alert = metrics.thermal.deficitKW > 0;
    nodes.push({ id: "cooling", label: "Cooling", status: alert ? "alert" : "ok",
      alert: alert ? "overheating" : undefined,
      stat: `${fmt(metrics.thermal.coolingKW)} kW removal` });
  }

  const has = (id: FlowNodeId) => nodes.some((n) => n.id === id);
  const edges: FlowEdge[] = [];
  if (has("power") && has("compute")) edges.push({ from: "power", to: "compute", kind: "power", status: "ok" });
  if (has("power") && has("cooling")) edges.push({ from: "power", to: "cooling", kind: "power", status: "ok" });
  if (has("power") && has("network")) edges.push({ from: "power", to: "network", kind: "power", status: "ok" });
  if (has("network") && has("compute")) {
    edges.push({ from: "network", to: "compute", kind: "network",
      status: numAcc >= 2 && !metrics.network.clusterConnected ? "alert" : "ok" });
  }
  if (has("compute") && has("cooling")) {
    edges.push({ from: "compute", to: "cooling", kind: "heat",
      status: metrics.thermal.deficitKW > 0 ? "alert" : "ok" });
  }
  return { nodes, edges };
}
```

- [ ] **Step 5: Run** — PASS.

- [ ] **Step 6: Commit** — `feat(ui): buildFlowModel + iconForCategory for infra board`.

---

### Task 4: UI integration (progress, nav, board, detail panel)

**Files:** Modify `index.html`, `src/main.ts`. Verified by running the app + `npm test`/`typecheck`.

- [ ] **Step 1: `index.html`** — add a course bar in the header, a full-width board panel after `<main>`, and detail-panel markup at end of `<body>`; add styles for `.crumb`, `.step`, `.bar/.fill`, `.navfoot`, board nodes/edges/legend, `.coursebar`, ⓘ button, `#detail-panel`/`#detail-backdrop`.

- [ ] **Step 2: `src/main.ts`** — implement:
  - **State:** `viewIndex` (init to frontier), `answeredCorrect: Set<string>`.
  - **Helpers:** `frontierIndex()`, `clampView()`, `satisfied(block)`.
  - **`renderLesson`:** breadcrumb + `Step N of M` + per-lesson bar, body, unlocked visuals, quiz (interactive; highlights correct on review), hint area + `✓ requirement met`, and a fixed **footer nav** (`← Previous` / `Next →`) with the gating model. Remove inline Got it/Continue.
  - **Footer logic:** Previous enabled when `viewIndex>0`; Next enabled when reviewing (`viewIndex<frontier`) or (at frontier and `satisfied`). Next at frontier completes the block + advances `viewIndex`.
  - **`renderBoard`:** compute metrics for the active workload/modality, `buildFlowModel`, render an inline SVG (fixed node layout: power left, compute center, network upper-right, cooling lower-right; edges drawn behind opaque nodes; colors ⚡`#f2c744` / net `#4ea1ff` / heat `#f85149`; alert = red dashed edges, red-bordered nodes with the alert reason; `iconForCategory` inside each node) + a legend. Empty state otherwise.
  - **Shelf ⓘ button:** add a small ⓘ to each shelf item (the body still adds); ⓘ opens the detail panel.
  - **Detail panel:** `openDetail(typeId)` renders icon, name + vendor, description, a specs table (specs entries + Power/Heat/Capex), and a `Learn more ↗` link; backdrop/✕/`Esc` close.
  - **Course bar:** fill = `courseProgressPct`.
  - Reset `viewIndex = frontierIndex()` on load and `setMode`.

- [ ] **Step 3: Run `npm test && npm run typecheck`** — all PASS.

- [ ] **Step 4: Run the app (`npm run dev`) and verify:**
  - Each block shows breadcrumb + Step N of M + bars; footer nav is in a consistent place.
  - Previous reviews earlier blocks; Next is blocked at an unfinished task/challenge, enabled after the requirement is met; reviewing is free.
  - Board shows grouped nodes + colored edges; under-power/overheat/un-cluster turn red.
  - ⓘ opens the detail panel with description + working Wikipedia link; body click still adds; backdrop/Esc close.

- [ ] **Step 5: Commit** — `feat(ui): lesson progress, footer nav, infra board, part detail panel`.

---

## Done criteria (maps to spec §8)

1. ✅ Progress: breadcrumb + Step N of M + per-lesson bar + course bar (Tasks 1, 4).
2. ✅ Fixed footer nav, free-review/gated-forward; inline advance buttons removed (Task 4).
3. ✅ Grouped-by-type, color-coded flow board with red diagnostics + empty state (Tasks 3, 4).
4. ✅ ⓘ → side panel with description/specs/cost/Wikipedia link; body click still adds (Tasks 2, 4).
5. ✅ New pure logic unit-tested; `npm test` + `npm run typecheck` pass (Tasks 1–3).
