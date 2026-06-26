# Curriculum (Modules 1–3) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Add a guided "Learn" mode to Data Center Builder covering Modules 1–3 (Anatomy → Keep it alive → Make it a cluster), layered on the existing playground, with declarative lesson data, an engine-backed success-checker, localStorage progress, and a lesson UI alongside the existing Sandbox.

**Architecture:** Pure, testable curriculum logic (`src/curriculum/*`) sits on top of the simulation core — success checks call `evaluateBuild` / `evaluateAgainstWorkload`, so there is no second copy of rules. The UI (`src/main.ts`) gains a Learn/Sandbox toggle; Learn mode renders the current block, filters the shelf to unlocked parts, and advances on success.

**Tech Stack:** TypeScript (strict), Vitest, Vite. No new dependencies.

## Global Constraints

- Curriculum logic in `src/curriculum/` is **pure and headless** (no DOM); only `src/main.ts` touches the DOM.
- Lessons are **declarative data** — adding content never edits engine or checker code.
- Success checks **reuse the simulation core** (`evaluateBuild`/`evaluateAgainstWorkload`); no duplicated rules.
- `noViolations` means **no error-severity violations** (warnings are allowed).
- Progress persists to **localStorage**, behind a small interface so Supabase can replace it later.

---

### Task 1: Curriculum types

**Files:**
- Create: `src/curriculum/types.ts`
- Test: `src/curriculum/__tests__/types.test.ts`

**Interfaces:**
- Consumes: `Workload`, `Modality` from `../sim`.
- Produces: `SuccessCheck`, `HintRule`, `Block`, `Lesson`, `Module`, `Course`, `Progress`.

- [ ] **Step 1: Create `src/curriculum/types.ts`**

```ts
import type { Bottleneck, Category, Modality, Workload } from "../sim";

export type SuccessCheck =
  | { require: "componentCount"; category: Category; min: number }
  | { require: "connected"; kind: "power" | "network" }
  | { require: "noViolations" }
  | { require: "metricAtLeast"; path: string; value: number; modality?: Modality }
  | { require: "workloadPassed" }
  | { all: SuccessCheck[] }
  | { any: SuccessCheck[] };

export interface HintRule {
  when?: Exclude<Bottleneck, null>;
  text: string;
}

export type BlockType = "teach" | "task" | "challenge" | "reflect";

export interface Block {
  id: string;
  type: BlockType;
  title: string;
  body: string;
  unlocks?: string[]; // component type ids
  workload?: Workload; // for challenge blocks (and metricAtLeast modality context)
  successCheck?: SuccessCheck; // for task/challenge blocks
  hints?: HintRule[];
  quiz?: { options: string[]; answerIndex: number }; // for reflect blocks
}

export interface Lesson { id: string; title: string; blocks: Block[]; }
export interface Module { id: string; title: string; lessons: Lesson[]; }
export interface Course { id: string; title: string; modules: Module[]; }

export interface Progress {
  completedBlockIds: string[];
}
```

- [ ] **Step 2: Write the failing test `src/curriculum/__tests__/types.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import type { Course } from "../types";

describe("curriculum types", () => {
  it("a Course is plain serializable data", () => {
    const c: Course = {
      id: "c1", title: "T",
      modules: [{ id: "m1", title: "M", lessons: [{ id: "l1", title: "L", blocks: [
        { id: "b1", type: "teach", title: "Hi", body: "Body" },
      ] }] }],
    };
    expect(JSON.parse(JSON.stringify(c))).toEqual(c);
  });
});
```

- [ ] **Step 3: Run test** — `npm test` → PASS.

- [ ] **Step 4: Commit**

```bash
git add src/curriculum/types.ts src/curriculum/__tests__/types.test.ts
git commit -m "feat(curriculum): define lesson/course types"
```

---

### Task 2: Success checker

**Files:**
- Create: `src/curriculum/check.ts`
- Test: `src/curriculum/__tests__/check.test.ts`

**Interfaces:**
- Consumes: `evaluateBuild`, `evaluateAgainstWorkload`, `resolveInstances`-equivalent counting via `evaluateBuild`; `Build` from `../sim`.
- Produces: `checkSuccess(check: SuccessCheck, build: Build, block?: { workload?: Workload }): boolean`.

- [ ] **Step 1: Write the failing test `src/curriculum/__tests__/check.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { checkSuccess } from "../check";
import type { Build } from "../../sim";

function build(typeIds: string[], connections: Build["connections"] = []): Build {
  return {
    components: typeIds.map((typeId, i) => ({ instanceId: `i${i}`, typeId, position: { x: 0, y: 0 } })),
    connections,
  };
}

describe("checkSuccess", () => {
  it("componentCount counts a category", () => {
    const b = build(["gpu-nvidia-a100", "gpu-nvidia-a100", "rack-42u"]);
    expect(checkSuccess({ require: "componentCount", category: "accelerator", min: 2 }, b)).toBe(true);
    expect(checkSuccess({ require: "componentCount", category: "accelerator", min: 3 }, b)).toBe(false);
    expect(checkSuccess({ require: "componentCount", category: "rack", min: 1 }, b)).toBe(true);
  });

  it("noViolations passes only when there are no error violations", () => {
    const healthy = build(
      ["gpu-nvidia-a100", "power-grid-feed", "cooling-crac"],
      [{ from: "i0", to: "i1", kind: "power" }],
    );
    expect(checkSuccess({ require: "noViolations" }, healthy)).toBe(true);

    const unpowered = build(["gpu-nvidia-a100"]); // unpowered-component error
    expect(checkSuccess({ require: "noViolations" }, unpowered)).toBe(false);
  });

  it("metricAtLeast reads a nested metric path", () => {
    const b = build(["gpu-nvidia-h100", "gpu-nvidia-h100"]); // ~6000 inference QPS text
    expect(checkSuccess({ require: "metricAtLeast", path: "compute.inferenceThroughput", value: 5000 }, b)).toBe(true);
    expect(checkSuccess({ require: "metricAtLeast", path: "compute.inferenceThroughput", value: 7000 }, b)).toBe(false);
  });

  it("workloadPassed uses the block's workload", () => {
    const b = build(
      ["gpu-nvidia-h100", "gpu-nvidia-h100", "power-grid-feed", "cooling-crac"],
      [{ from: "i0", to: "i2", kind: "power" }, { from: "i1", to: "i2", kind: "power" }],
    );
    const ok = checkSuccess({ require: "workloadPassed" }, b, {
      workload: { type: "inference", modality: "text", model: "x", qpsTarget: 5000 },
    });
    expect(ok).toBe(true);
  });

  it("all / any compose", () => {
    const b = build(["gpu-nvidia-a100", "rack-42u"]);
    expect(checkSuccess({ all: [
      { require: "componentCount", category: "accelerator", min: 1 },
      { require: "componentCount", category: "rack", min: 1 },
    ] }, b)).toBe(true);
    expect(checkSuccess({ any: [
      { require: "componentCount", category: "accelerator", min: 99 },
      { require: "componentCount", category: "rack", min: 1 },
    ] }, b)).toBe(true);
  });
});
```

- [ ] **Step 2: Run test** — FAIL (`../check` missing).

- [ ] **Step 3: Create `src/curriculum/check.ts`**

```ts
import type { Build, Category, Metrics, Modality, Workload } from "../sim";
import { catalog, evaluateBuild, evaluateAgainstWorkload } from "../sim";
import type { SuccessCheck } from "./types";

function countCategory(build: Build, category: Category): number {
  const idx = new Map(catalog.map((c) => [c.id, c]));
  return build.components.filter((c) => idx.get(c.typeId)?.category === category).length;
}

function hasConnection(build: Build, kind: "power" | "network"): boolean {
  return build.connections.some((c) => c.kind === kind);
}

function readPath(metrics: Metrics, path: string): number {
  const value = path.split(".").reduce<unknown>((acc, key) => {
    if (acc && typeof acc === "object" && key in (acc as Record<string, unknown>)) {
      return (acc as Record<string, unknown>)[key];
    }
    return undefined;
  }, metrics);
  return typeof value === "number" ? value : NaN;
}

export function checkSuccess(
  check: SuccessCheck,
  build: Build,
  block?: { workload?: Workload },
): boolean {
  if ("all" in check) return check.all.every((c) => checkSuccess(c, build, block));
  if ("any" in check) return check.any.some((c) => checkSuccess(c, build, block));

  switch (check.require) {
    case "componentCount":
      return countCategory(build, check.category) >= check.min;
    case "connected":
      return hasConnection(build, check.kind);
    case "noViolations": {
      const m = evaluateBuild(build);
      return m.violations.filter((v) => v.severity === "error").length === 0;
    }
    case "metricAtLeast": {
      const modality: Modality = check.modality ?? block?.workload?.modality ?? "text";
      const m = evaluateBuild(build, { modality });
      const got = readPath(m, check.path);
      return Number.isFinite(got) && got >= check.value;
    }
    case "workloadPassed": {
      if (!block?.workload) return false;
      return evaluateAgainstWorkload(build, block.workload).passed;
    }
  }
}
```

- [ ] **Step 4: Run test** — PASS.

- [ ] **Step 5: Commit**

```bash
git add src/curriculum/check.ts src/curriculum/__tests__/check.test.ts
git commit -m "feat(curriculum): engine-backed success checker"
```

---

### Task 3: Progress logic (pure reducer)

**Files:**
- Create: `src/curriculum/progress.ts`
- Test: `src/curriculum/__tests__/progress.test.ts`

**Interfaces:**
- Consumes: `Course`, `Block`, `Progress` from `./types`.
- Produces:
  - `flattenBlocks(course: Course): Block[]`
  - `currentBlock(course: Course, progress: Progress): Block | null`
  - `unlockedComponents(course: Course, progress: Progress): Set<string>`
  - `completeBlock(progress: Progress, blockId: string): Progress`
  - `courseProgressPct(course: Course, progress: Progress): number`

- [ ] **Step 1: Write the failing test `src/curriculum/__tests__/progress.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import {
  flattenBlocks,
  currentBlock,
  unlockedComponents,
  completeBlock,
  courseProgressPct,
} from "../progress";
import type { Course, Progress } from "../types";

const course: Course = {
  id: "c", title: "C",
  modules: [{ id: "m1", title: "M1", lessons: [{ id: "l1", title: "L1", blocks: [
    { id: "b1", type: "teach", title: "t", body: "b", unlocks: ["gpu-nvidia-a100"] },
    { id: "b2", type: "task", title: "t", body: "b", unlocks: ["power-grid-feed"], successCheck: { require: "componentCount", category: "accelerator", min: 1 } },
    { id: "b3", type: "teach", title: "t", body: "b", unlocks: ["rack-42u"] },
  ] }] }],
};

describe("progress", () => {
  it("flattens blocks in order", () => {
    expect(flattenBlocks(course).map((b) => b.id)).toEqual(["b1", "b2", "b3"]);
  });

  it("current block is the first incomplete one", () => {
    expect(currentBlock(course, { completedBlockIds: [] })!.id).toBe("b1");
    expect(currentBlock(course, { completedBlockIds: ["b1"] })!.id).toBe("b2");
    expect(currentBlock(course, { completedBlockIds: ["b1", "b2", "b3"] })).toBeNull();
  });

  it("unlocks accumulate up to and including the current block", () => {
    // at b1: only b1's unlocks
    expect(unlockedComponents(course, { completedBlockIds: [] })).toEqual(new Set(["gpu-nvidia-a100"]));
    // at b2 (b1 done): b1 + b2 unlocks
    expect(unlockedComponents(course, { completedBlockIds: ["b1"] })).toEqual(
      new Set(["gpu-nvidia-a100", "power-grid-feed"]),
    );
  });

  it("completeBlock is idempotent and append-only", () => {
    const p: Progress = { completedBlockIds: ["b1"] };
    expect(completeBlock(p, "b2").completedBlockIds).toEqual(["b1", "b2"]);
    expect(completeBlock(p, "b1").completedBlockIds).toEqual(["b1"]);
  });

  it("progress percent reflects completed fraction", () => {
    expect(courseProgressPct(course, { completedBlockIds: [] })).toBe(0);
    expect(courseProgressPct(course, { completedBlockIds: ["b1", "b2", "b3"] })).toBe(100);
  });
});
```

- [ ] **Step 2: Run test** — FAIL.

- [ ] **Step 3: Create `src/curriculum/progress.ts`**

```ts
import type { Block, Course, Progress } from "./types";

export function flattenBlocks(course: Course): Block[] {
  return course.modules.flatMap((m) => m.lessons.flatMap((l) => l.blocks));
}

export function currentBlock(course: Course, progress: Progress): Block | null {
  const done = new Set(progress.completedBlockIds);
  return flattenBlocks(course).find((b) => !done.has(b.id)) ?? null;
}

export function unlockedComponents(course: Course, progress: Progress): Set<string> {
  const blocks = flattenBlocks(course);
  const current = currentBlock(course, progress);
  const out = new Set<string>();
  for (const b of blocks) {
    for (const u of b.unlocks ?? []) out.add(u);
    if (current && b.id === current.id) break; // include up to current
    if (!current) continue; // course complete → include all
  }
  return out;
}

export function completeBlock(progress: Progress, blockId: string): Progress {
  if (progress.completedBlockIds.includes(blockId)) return progress;
  return { completedBlockIds: [...progress.completedBlockIds, blockId] };
}

export function courseProgressPct(course: Course, progress: Progress): number {
  const total = flattenBlocks(course).length;
  if (!total) return 0;
  const done = flattenBlocks(course).filter((b) => progress.completedBlockIds.includes(b.id)).length;
  return Math.round((done / total) * 100);
}
```

- [ ] **Step 4: Run test** — PASS.

- [ ] **Step 5: Commit**

```bash
git add src/curriculum/progress.ts src/curriculum/__tests__/progress.test.ts
git commit -m "feat(curriculum): pure progress/unlock reducer"
```

---

### Task 4: Course content (Modules 1–3) + validation

**Files:**
- Create: `src/curriculum/content.ts`
- Create: `src/curriculum/index.ts`
- Test: `src/curriculum/__tests__/content.test.ts`

**Interfaces:**
- Consumes: `Course` from `./types`; `catalog` from `../sim`; `checkSuccess`, `flattenBlocks`.
- Produces: `export const course: Course`; barrel `index.ts` re-exporting types, `course`, `checkSuccess`, and progress helpers.

- [ ] **Step 1: Create `src/curriculum/content.ts`** (Modules 1–3)

```ts
import type { Course } from "./types";

export const course: Course = {
  id: "dc-foundations",
  title: "Data Center Foundations",
  modules: [
    {
      id: "m1",
      title: "Anatomy of a server",
      lessons: [
        {
          id: "m1l1",
          title: "Your first chip",
          blocks: [
            { id: "m1l1b1", type: "teach", title: "What's a chip?",
              body: "AI runs on accelerators — specialized chips. Each one does a lot of math, draws power, and gives off heat. Let's add one.",
              unlocks: ["gpu-nvidia-a100", "power-grid-feed"] },
            { id: "m1l1b2", type: "task", title: "Add an accelerator",
              body: "Add an NVIDIA A100 from the shelf.",
              successCheck: { require: "componentCount", category: "accelerator", min: 1 },
              hints: [{ text: "Click the A100 under “Chips” in the parts shelf." }] },
            { id: "m1l1b3", type: "task", title: "Plug it in",
              body: "A chip with no power does nothing. Add a Utility Grid Feed — power wires up automatically.",
              successCheck: { require: "componentCount", category: "power", min: 1 },
              hints: [{ text: "The grid feed is under “Power”." }] },
            { id: "m1l1b4", type: "reflect", title: "Quick check",
              body: "Why did the chip need the grid feed?",
              quiz: { options: ["For looks", "Chips need electricity to run", "To make it heavier"], answerIndex: 1 } },
          ],
        },
        {
          id: "m1l2",
          title: "Rack it up",
          blocks: [
            { id: "m1l2b1", type: "teach", title: "Racks hold your gear",
              body: "Real data centers mount servers and chips in racks. Add one so your build has a home.",
              unlocks: ["rack-42u", "server-2u"] },
            { id: "m1l2b2", type: "task", title: "Add a rack",
              body: "Add a 42U Rack from the shelf.",
              successCheck: { require: "componentCount", category: "rack", min: 1 } },
          ],
        },
      ],
    },
    {
      id: "m2",
      title: "Keep it alive",
      lessons: [
        {
          id: "m2l1",
          title: "Power and cooling",
          blocks: [
            { id: "m2l1b1", type: "teach", title: "Bigger chips, bigger heat",
              body: "The H100 is far more powerful than the A100 — and runs hotter. Power must cover the draw, and cooling must remove the heat.",
              unlocks: ["gpu-nvidia-h100", "cooling-crac", "power-ups"] },
            { id: "m2l1b2", type: "challenge", title: "A healthy build",
              body: "Add an H100, enough power, and a CRAC cooling unit so there are NO red warnings.",
              successCheck: { require: "noViolations" },
              hints: [
                { when: "power", text: "You're short on power — add a grid feed or UPS." },
                { when: "cooling", text: "Heat is building up — add a CRAC cooling unit." },
              ] },
            { id: "m2l1b3", type: "reflect", title: "Quick check",
              body: "What happens if cooling can't keep up with heat?",
              quiz: { options: ["Nothing", "The build overheats and can't run reliably", "It gets cheaper"], answerIndex: 1 } },
          ],
        },
      ],
    },
    {
      id: "m3",
      title: "Make it a cluster",
      lessons: [
        {
          id: "m3l1",
          title: "Training needs a network",
          blocks: [
            { id: "m3l1b1", type: "teach", title: "Many chips, one job",
              body: "Training a model splits work across many chips that must talk constantly. Without a fast network, they can't act as one cluster — and training crawls.",
              unlocks: ["net-spine-switch", "net-tor-switch"] },
            { id: "m3l1b2", type: "challenge", title: "Train a small model",
              body: "Build at least 4 H100s, power, cooling, AND a Spine Switch so the cluster connects — then meet the training goal.",
              workload: { type: "training", modality: "text", modelSizeB: 8, targetThroughput: 2500 },
              successCheck: { require: "workloadPassed" },
              hints: [
                { when: "network", text: "Your chips aren't clustered — add a Spine Switch." },
                { when: "compute", text: "Not enough training power — add more H100s." },
                { when: "power", text: "Add more power capacity." },
                { when: "cooling", text: "Add more cooling." },
              ] },
            { id: "m3l1b3", type: "reflect", title: "Quick check",
              body: "You serve ChatGPT-style inference instead. Does it need the same fast cluster network as training?",
              quiz: { options: ["Yes, exactly the same", "No — inference splits across chips far more easily", "Inference can't use GPUs"], answerIndex: 1 } },
          ],
        },
      ],
    },
  ],
};
```

- [ ] **Step 2: Create `src/curriculum/index.ts`**

```ts
export type * from "./types";
export { course } from "./content";
export { checkSuccess } from "./check";
export {
  flattenBlocks,
  currentBlock,
  unlockedComponents,
  completeBlock,
  courseProgressPct,
} from "./progress";
```

- [ ] **Step 3: Write the failing test `src/curriculum/__tests__/content.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { course } from "../content";
import { flattenBlocks } from "../progress";
import { catalog } from "../../sim";

describe("course content", () => {
  const blocks = flattenBlocks(course);
  const catalogIds = new Set(catalog.map((c) => c.id));

  it("has Modules 1–3", () => {
    expect(course.modules.map((m) => m.id)).toEqual(["m1", "m2", "m3"]);
  });

  it("every unlocked component id exists in the catalog", () => {
    for (const b of blocks) {
      for (const u of b.unlocks ?? []) {
        expect(catalogIds, `${b.id} unlocks ${u}`).toContain(u);
      }
    }
  });

  it("every block id is unique", () => {
    const ids = blocks.map((b) => b.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("task/challenge blocks have a successCheck; reflect blocks have a quiz", () => {
    for (const b of blocks) {
      if (b.type === "task" || b.type === "challenge") expect(b.successCheck, b.id).toBeDefined();
      if (b.type === "reflect") expect(b.quiz, b.id).toBeDefined();
    }
  });

  it("challenge blocks that require workloadPassed declare a workload", () => {
    for (const b of blocks) {
      if (b.successCheck && "require" in b.successCheck && b.successCheck.require === "workloadPassed") {
        expect(b.workload, b.id).toBeDefined();
      }
    }
  });
});
```

- [ ] **Step 4: Run test** — `npm test` → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/curriculum/content.ts src/curriculum/index.ts src/curriculum/__tests__/content.test.ts
git commit -m "feat(curriculum): Modules 1-3 content + barrel export"
```

---

### Task 5: Learn-mode UI integration

**Files:**
- Modify: `src/main.ts`
- Modify: `index.html` (add a mode toggle container + lesson panel styles)

**Interfaces:**
- Consumes: `course`, `checkSuccess`, `currentBlock`, `unlockedComponents`, `completeBlock`, `courseProgressPct` from `./curriculum`.
- Produces: no exports (UI). Verified by running the app.

- [ ] **Step 1: Add mode toggle + lesson styles to `index.html`**

In `<header>`, after the `<p>`, add:
```html
<div style="margin-top:10px">
  <button id="mode-learn" class="mode">Learn</button>
  <button id="mode-sandbox" class="mode">Sandbox</button>
  <span id="progress" class="sub" style="margin-left:10px"></span>
</div>
```
Add to `<style>`:
```css
button.mode { background: var(--panel2); border: 1px solid var(--line); color: var(--text); border-radius: 7px; padding: 6px 14px; cursor: pointer; margin-right: 6px; }
button.mode.active { background: var(--accent); border-color: var(--accent); color: #04121f; font-weight: 600; }
.lesson { background: var(--panel2); border: 1px solid var(--line); border-radius: 9px; padding: 12px; }
.lesson .kind { font-size: 11px; text-transform: uppercase; letter-spacing: .05em; color: var(--accent); }
.lesson h3 { margin: 4px 0 8px; font-size: 16px; }
.lesson .actions { margin-top: 12px; display: flex; gap: 8px; flex-wrap: wrap; }
.lesson button { background: var(--accent); border: none; color: #04121f; font-weight: 600; border-radius: 7px; padding: 8px 14px; cursor: pointer; }
.lesson button:disabled { background: var(--line); color: var(--muted); cursor: not-allowed; }
.lesson button.ghost { background: none; border: 1px solid var(--line); color: var(--text); font-weight: 400; }
.hint { margin-top: 10px; color: var(--warn); font-size: 13px; }
.quiz button { display:block; width:100%; text-align:left; background: var(--panel); border:1px solid var(--line); color: var(--text); font-weight: 400; margin: 4px 0; }
.done { color: var(--ok); font-weight: 600; }
```

- [ ] **Step 2: Refactor `src/main.ts` to support modes**

Replace the file with the version below. It keeps the Sandbox behavior intact and adds Learn mode. Key behaviors:
- `mode` state (`"learn" | "sandbox"`), persisted with progress in `localStorage` under `dcb-progress` / `dcb-mode`.
- In **Sandbox**: shelf shows all parts, scenario selector visible (existing behavior).
- In **Learn**: shelf shows only `unlockedComponents`; the middle panel shows the current `Block`; the scenario selector is hidden (the block's workload, if any, drives the readout).
- Teach → "Got it" completes. Task/Challenge → "Continue" enabled when `checkSuccess` true; a "Hint" button shows the bottleneck-keyed hint. Reflect → clicking the correct quiz option completes.
- On course completion, show a done message and offer Sandbox.

```ts
import {
  catalog, evaluateBuild, evaluateAgainstWorkload, PRICING_DISCLAIMER, LAST_UPDATED,
} from "./sim";
import type { Build, Category, Metrics, Modality, Workload } from "./sim";
import {
  course, checkSuccess, currentBlock, unlockedComponents, completeBlock, courseProgressPct,
} from "./curriculum";
import type { Block, Progress } from "./curriculum";

// ---- state ----
const build: Build = { components: [], connections: [] };
let counter = 0;
let mode: "learn" | "sandbox" = (localStorage.getItem("dcb-mode") as "learn" | "sandbox") || "learn";
let progress: Progress = loadProgress();

function loadProgress(): Progress {
  try {
    const raw = localStorage.getItem("dcb-progress");
    if (raw) return JSON.parse(raw) as Progress;
  } catch { /* ignore */ }
  return { completedBlockIds: [] };
}
function saveProgress() { localStorage.setItem("dcb-progress", JSON.stringify(progress)); }
function saveMode() { localStorage.setItem("dcb-mode", mode); }

// ---- sandbox scenarios (unchanged) ----
interface Scenario { id: string; label: string; modality: Modality; workload: Workload | null; }
const SCENARIOS: Scenario[] = [
  { id: "free-text", label: "Free build — text workload", modality: "text", workload: null },
  { id: "free-image", label: "Free build — image workload", modality: "image", workload: null },
  { id: "chatgpt", label: "Serve ChatGPT — text inference, 5,000 q/s", modality: "text",
    workload: { type: "inference", modality: "text", model: "ChatGPT", qpsTarget: 5000 } },
  { id: "midjourney", label: "Serve Midjourney — image, 50 img/s", modality: "image",
    workload: { type: "inference", modality: "image", model: "Midjourney", qpsTarget: 50 } },
  { id: "train", label: "Train a Llama-ish model", modality: "text",
    workload: { type: "training", modality: "text", modelSizeB: 8, targetThroughput: 2500 } },
];
let scenarioId = SCENARIOS[0].id;
let lastHint = "";

// ---- helpers ----
const CATEGORY_ORDER: Category[] = ["accelerator","cpu","server","rack","power","cooling","network","space"];
const CATEGORY_LABEL: Record<Category, string> = {
  accelerator:"Chips (accelerators)", cpu:"CPUs", server:"Servers", rack:"Racks",
  power:"Power", cooling:"Cooling", network:"Networking", space:"Space / land",
};
const $ = (id: string) => document.getElementById(id)!;
const fmt = (n: number, d = 0) => !Number.isFinite(n) ? "∞" : n.toLocaleString("en-US", { maximumFractionDigits: d });
const money = (n: number) => !Number.isFinite(n) ? "∞" : "$" + n.toLocaleString("en-US", { maximumFractionDigits: 0 });
const typeOf = (id: string) => catalog.find((c) => c.id === id);

function rewirePower() {
  const firstPower = build.components.find((c) => typeOf(c.typeId)?.category === "power");
  build.connections = [];
  if (!firstPower) return;
  for (const c of build.components) {
    const cat = typeOf(c.typeId)?.category;
    if (cat === "accelerator" || cat === "server") {
      build.connections.push({ from: c.instanceId, to: firstPower.instanceId, kind: "power" });
    }
  }
}
function addComponent(typeId: string) {
  build.components.push({ instanceId: `i${counter++}`, typeId, position: { x: 0, y: 0 } });
  rewirePower(); lastHint = ""; render();
}
function removeComponent(instanceId: string) {
  build.components = build.components.filter((c) => c.instanceId !== instanceId);
  rewirePower(); render();
}

// ---- rendering: shelf ----
function renderShelf() {
  const el = $("shelf"); el.innerHTML = "";
  const allowed = mode === "learn" ? unlockedComponents(course, progress) : null;
  for (const cat of CATEGORY_ORDER) {
    const parts = catalog.filter((c) => c.category === cat && (!allowed || allowed.has(c.id)));
    if (!parts.length) continue;
    const wrap = document.createElement("div"); wrap.className = "cat";
    wrap.innerHTML = `<h3>${CATEGORY_LABEL[cat]}</h3>`;
    for (const p of parts) {
      const b = document.createElement("button"); b.className = "add";
      const watt = p.powerDraw ? `${fmt(p.powerDraw)}W · ` : "";
      b.innerHTML = `+ ${p.name} <small>${watt}${money(p.capex)}</small>`;
      b.onclick = () => addComponent(p.id);
      wrap.appendChild(b);
    }
    el.appendChild(wrap);
  }
  if (allowed && !allowed.size) el.innerHTML = `<div class="empty">Parts unlock as you progress.</div>`;
}

// ---- rendering: build list ----
function renderBuild() {
  const el = $("build");
  if (!build.components.length) { el.innerHTML = `<div class="empty">Empty — add some parts.</div>`; return; }
  el.innerHTML = "";
  for (const c of build.components) {
    const row = document.createElement("div"); row.className = "row";
    row.innerHTML = `<span>${typeOf(c.typeId)?.name ?? c.typeId}</span>`;
    const btn = document.createElement("button"); btn.textContent = "✕"; btn.title = "Remove";
    btn.onclick = () => removeComponent(c.instanceId);
    row.appendChild(btn); el.appendChild(row);
  }
}

// ---- rendering: middle (scenario in sandbox, lesson in learn) ----
function renderMiddle() {
  const scenarioWrap = $("scenario-wrap");
  const lessonWrap = $("lesson");
  if (mode === "sandbox") {
    scenarioWrap.style.display = ""; lessonWrap.style.display = "none";
    renderScenarioSelect();
  } else {
    scenarioWrap.style.display = "none"; lessonWrap.style.display = "";
    renderLesson();
  }
}

function renderScenarioSelect() {
  const el = $("scenario") as HTMLSelectElement;
  if (!el.options.length) {
    for (const s of SCENARIOS) { const o = document.createElement("option"); o.value = s.id; o.textContent = s.label; el.appendChild(o); }
    el.onchange = () => { scenarioId = el.value; render(); };
  }
  el.value = scenarioId;
}

function renderLesson() {
  const el = $("lesson");
  const block = currentBlock(course, progress);
  if (!block) {
    el.innerHTML = `<div class="kind">Course complete</div><h3>🎉 You finished the foundations!</h3>
      <p class="sub">You've covered chips, power, cooling, and why training needs a network. Jump into Sandbox to build freely.</p>
      <div class="actions"><button id="to-sandbox">Open Sandbox</button></div>`;
    ($("to-sandbox") as HTMLButtonElement).onclick = () => { setMode("sandbox"); };
    return;
  }
  let html = `<div class="kind">${block.type}</div><h3>${block.title}</h3><p>${block.body}</p>`;
  if (block.type === "reflect" && block.quiz) {
    html += `<div class="quiz">` + block.quiz.options
      .map((o, i) => `<button data-i="${i}">${o}</button>`).join("") + `</div>`;
  }
  html += `<div class="actions"></div>`;
  if (lastHint) html += `<div class="hint">💡 ${lastHint}</div>`;
  el.innerHTML = html;

  const actions = el.querySelector(".actions")!;
  if (block.type === "teach") {
    const b = document.createElement("button"); b.textContent = "Got it →";
    b.onclick = () => advance(block); actions.appendChild(b);
  } else if (block.type === "task" || block.type === "challenge") {
    const satisfied = block.successCheck ? checkSuccess(block.successCheck, build, block) : false;
    const cont = document.createElement("button"); cont.textContent = "Continue →";
    cont.disabled = !satisfied; cont.onclick = () => advance(block); actions.appendChild(cont);
    const hint = document.createElement("button"); hint.className = "ghost"; hint.textContent = "Hint";
    hint.onclick = () => { lastHint = computeHint(block); render(); }; actions.appendChild(hint);
    if (satisfied) actions.insertAdjacentHTML("beforeend", `<span class="done">✓ requirement met</span>`);
  } else if (block.type === "reflect" && block.quiz) {
    el.querySelectorAll<HTMLButtonElement>(".quiz button").forEach((qb) => {
      qb.onclick = () => {
        const i = Number(qb.dataset.i);
        if (i === block.quiz!.answerIndex) advance(block);
        else { lastHint = "Not quite — try again."; render(); }
      };
    });
  }
}

function computeHint(block: Block): string {
  if (!block.hints?.length) return "Check the requirement in the task description.";
  // If the block has a workload, use its bottleneck; else first generic hint.
  if (block.workload) {
    const r = evaluateAgainstWorkload(build, block.workload);
    const keyed = block.hints.find((h) => h.when && h.when === r.bottleneck);
    if (keyed) return keyed.text;
  }
  // try matching any error bottleneck from a plain build eval
  const m = evaluateBuild(build);
  const err = m.violations.find((v) => v.severity === "error");
  if (err) {
    const map: Record<string, string> = { "power-deficit": "power", "unpowered-component": "power", "overheating": "cooling" };
    const bn = map[err.code];
    const keyed = block.hints.find((h) => h.when === bn);
    if (keyed) return keyed.text;
  }
  return block.hints[0].text;
}

function advance(block: Block) {
  progress = completeBlock(progress, block.id); saveProgress(); lastHint = ""; render();
}

// ---- rendering: readout (right) ----
function activeWorkload(): { workload: Workload | null; modality: Modality } {
  if (mode === "sandbox") {
    const s = SCENARIOS.find((x) => x.id === scenarioId)!;
    return { workload: s.workload, modality: s.modality };
  }
  const block = currentBlock(course, progress);
  if (block?.workload) return { workload: block.workload, modality: block.workload.modality };
  return { workload: null, modality: "text" };
}

function renderReadout() {
  const { workload, modality } = activeWorkload();
  let metrics: Metrics; const resultEl = $("result");
  if (workload) {
    const r = evaluateAgainstWorkload(build, workload); metrics = r.metrics;
    resultEl.className = `result ${r.passed ? "pass" : "fail"}`;
    const bn = r.bottleneck ? ` · limited by <code>${r.bottleneck}</code>` : "";
    resultEl.innerHTML = `${r.passed ? "✅ Goal met" : "❌ Not yet"} — score ${r.score}/100<div class="sub">${bn}</div>`;
  } else {
    metrics = evaluateBuild(build, { modality }); resultEl.className = "";
    resultEl.innerHTML = `<div class="sub">Free build — modality <code>${modality}</code></div>`;
  }
  const unit = metrics.compute.modality === "image" ? "img/s" : "tok/s";
  const perUnit = metrics.compute.modality === "image" ? "per M images" : "per M tokens";
  const rows: [string, string][] = [
    ["Power draw", `${fmt(metrics.power.drawKW, 1)} kW`],
    ["Power supply", `${fmt(metrics.power.supplyKW, 1)} kW · ${metrics.power.redundancy}`],
    ["Heat / cooling", `${fmt(metrics.thermal.heatKW, 1)} / ${fmt(metrics.thermal.coolingKW, 1)} kW`],
    ["Network", `${fmt(metrics.network.bisectionGbps)} Gbps · ${metrics.network.clusterConnected ? "clustered" : "not clustered"}`],
    ["Training throughput", `${fmt(metrics.compute.trainingThroughput)}`],
    ["Inference throughput", `${fmt(metrics.compute.inferenceThroughput)} ${unit}`],
    ["Capex", money(metrics.cost.capex)],
    ["Opex / month", money(metrics.cost.opexPerMonth)],
    [`Cost ${perUnit}`, money(metrics.cost.costPerMillionTokens)],
    ["Footprint", `${fmt(metrics.space.usedSqM, 1)} m²`],
  ];
  $("metrics").innerHTML = rows.map(([k, v]) => `<div class="metric"><span class="sub">${k}</span><span>${v}</span></div>`).join("");
  const vEl = $("violations");
  vEl.innerHTML = !metrics.violations.length
    ? `<div class="sub">No issues. 🎉</div>`
    : metrics.violations.map((v) => `<div class="viol ${v.severity}">${v.severity === "error" ? "⛔" : "⚠️"} ${v.message}</div>`).join("");
}

// ---- mode ----
function setMode(m: "learn" | "sandbox") { mode = m; saveMode(); lastHint = ""; render(); }
function renderModeButtons() {
  ($("mode-learn") as HTMLButtonElement).className = "mode" + (mode === "learn" ? " active" : "");
  ($("mode-sandbox") as HTMLButtonElement).className = "mode" + (mode === "sandbox" ? " active" : "");
  $("progress").textContent = mode === "learn" ? `Progress: ${courseProgressPct(course, progress)}%` : "";
}

function render() {
  renderModeButtons(); renderShelf(); renderBuild(); renderMiddle(); renderReadout();
}

// ---- init ----
($("mode-learn") as HTMLButtonElement).onclick = () => setMode("learn");
($("mode-sandbox") as HTMLButtonElement).onclick = () => setMode("sandbox");
$("disclaimer").textContent = `${PRICING_DISCLAIMER} Catalog updated ${LAST_UPDATED}.`;
render();
```

- [ ] **Step 3: Wrap the scenario selector in `index.html`**

Change the middle panel's goal block so the selector lives in a wrapper and the lesson panel exists:
```html
<section class="panel">
  <h2>Your build</h2>
  <div id="build"></div>
  <div id="scenario-wrap" style="margin-top:14px">
    <h2>Goal</h2>
    <select id="scenario"></select>
  </div>
  <div id="lesson" class="lesson" style="margin-top:14px"></div>
</section>
```

- [ ] **Step 4: Run the app and verify Learn mode**

Run: `npm run dev`
Manually verify in the browser:
- Learn mode shows Lesson m1l1b1; shelf shows only A100 + grid feed.
- Add A100 → next task; add grid feed → reflect; answer correctly → Module 1 lesson 2.
- Module 2 challenge: add H100 + power + cooling → "requirement met" → Continue.
- Module 3 challenge: 4 H100s + power + cooling + spine switch → Goal met; Hint shows network/compute guidance when short.
- Toggle Sandbox → all parts return, scenario selector works.
- Reload page → progress persists.

- [ ] **Step 5: Run tests + typecheck**

Run: `npm test && npm run typecheck`
Expected: all PASS, no type errors.

- [ ] **Step 6: Commit**

```bash
git add src/main.ts index.html
git commit -m "feat(curriculum): Learn-mode UI with lessons, unlocks, hints, and progress"
```

---

## Done criteria (maps to curriculum design doc, Modules 1–3)

1. ✅ Guided Learn mode with Teach/Task/Challenge/Reflect blocks (Tasks 4–5).
2. ✅ Success checks reuse the simulation core; no duplicated rules (Task 2).
3. ✅ Component unlocks gated by progress (Tasks 3, 5).
4. ✅ Hints keyed to the engine's bottleneck (Tasks 4 content + 5 `computeHint`).
5. ✅ Progress persists (localStorage) behind a swappable boundary (Task 5).
6. ✅ Sandbox mode preserved (Task 5).
7. ✅ Modules 1–3 content, validated by tests (Task 4).
