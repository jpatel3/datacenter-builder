# Simulation Core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the headless, deterministic simulation core for Data Center Builder — a component/pricing catalog plus pure evaluator functions that compute power, heat, cost, compute capacity, networking, and violations, and grade a build against a workload.

**Architecture:** Pure TypeScript, no DOM. A `Build` is plain serializable data. Small focused pure functions each compute one slice of `Metrics`; `evaluateBuild` composes them; `evaluateAgainstWorkload` layers pass/fail + bottleneck + score on top. Everything is unit-tested with Vitest and is fully deterministic.

**Tech Stack:** TypeScript (strict), Vitest, Node ESM. No runtime dependencies.

## Global Constraints

These apply to every task:

- **Strict TypeScript**, ESM (`"type": "module"`), `target` ES2022.
- **Headless:** no DOM, no rendering, no network, no persistence in `src/sim`.
- **Deterministic:** no `Date.now()`, no `Math.random()`, no I/O in evaluators.
- **Costs in USD.** The pricing catalog carries a `LAST_UPDATED` date and a `PRICING_DISCLAIMER` ("approximate / illustrative, not a live price feed").
- **Accelerator roster spans vendors & specializations:** NVIDIA A100-class + H100-class (≈1.0 on all efficiencies), AMD MI300X (all-rounder), AWS Trainium (high `trainEff`, low `inferEff`), AWS Inferentia (high `inferEff`, low `trainEff`), Google TPU (strong at scale).
- **Chip mismatch is a warning, never a hard block.**
- **Public API entry point is `src/sim/index.ts`**, exporting `catalog`, `evaluateBuild`, `evaluateAgainstWorkload`, and the types.

---

### Task 1: Project scaffold + type definitions

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `vitest.config.ts`
- Create: `src/sim/types.ts`
- Test: `src/sim/__tests__/types.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: all shared types — `Category`, `Modality`, `Footprint`, `ComponentType`, `PlacedComponent`, `Connection`, `Build`, `ViolationCode`, `Violation`, `Bottleneck`, `Workload`, `Metrics`, `Result`, and the helper `EvalOpts`.

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "datacenter-builder",
  "private": true,
  "version": "0.0.1",
  "type": "module",
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc --noEmit"
  },
  "devDependencies": {
    "typescript": "^5.4.0",
    "vitest": "^1.6.0"
  }
}
```

- [ ] **Step 2: Create `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "noEmit": true,
    "types": ["vitest/globals"]
  },
  "include": ["src"]
}
```

- [ ] **Step 3: Create `vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: { globals: true, environment: "node" },
});
```

- [ ] **Step 4: Install dependencies**

Run: `npm install`
Expected: `node_modules/` created, `vitest` and `typescript` present.

- [ ] **Step 5: Create `src/sim/types.ts`**

```ts
export type Category =
  | "accelerator"
  | "cpu"
  | "server"
  | "rack"
  | "power"
  | "cooling"
  | "network"
  | "space";

export type Modality = "text" | "image";

export interface Footprint {
  rackUnits?: number;
  areaSqM?: number;
  weightKg?: number;
}

export interface ComponentType {
  id: string;
  name: string;
  category: Category;
  vendor: string;
  specs: Record<string, number | string>;
  capex: number;
  opexPerMonth?: number;
  footprint: Footprint;
  powerDraw: number; // watts
  heatOutput: number; // watts
  requires?: string[];
}

export interface PlacedComponent {
  instanceId: string;
  typeId: string;
  position: { x: number; y: number };
  config?: Record<string, unknown>;
}

export interface Connection {
  from: string; // instanceId
  to: string; // instanceId
  kind: "power" | "network";
}

export interface Build {
  components: PlacedComponent[];
  connections: Connection[];
  landBudgetSqM?: number;
}

export type ViolationCode =
  | "power-deficit"
  | "overheating"
  | "rack-overfull"
  | "no-network"
  | "over-land"
  | "unpowered-component"
  | "weight-exceeded"
  | "chip-mismatch";

export interface Violation {
  code: ViolationCode;
  severity: "error" | "warning";
  message: string;
  relatedInstanceIds: string[];
}

export interface Metrics {
  power: {
    drawKW: number;
    supplyKW: number;
    deficitKW: number;
    redundancy: "none" | "n+1";
  };
  thermal: { heatKW: number; coolingKW: number; deficitKW: number };
  compute: {
    trainingThroughput: number;
    inferenceThroughput: number;
    modality: Modality;
  };
  cost: {
    capex: number;
    opexPerMonth: number;
    dollarsPerTrainingUnit: number;
    costPerMillionTokens: number; // per-M-tokens (text) or per-M-images (image)
  };
  network: { bisectionGbps: number; clusterConnected: boolean };
  space: { usedSqM: number; capSqM?: number; overBudget: boolean };
  violations: Violation[];
}

export type Bottleneck =
  | "power"
  | "cooling"
  | "network"
  | "compute"
  | "space"
  | "budget"
  | "affordability"
  | null;

export type Workload =
  | {
      type: "training";
      modality: Modality;
      modelSizeB: number;
      gpuBudget?: number;
      targetThroughput?: number;
    }
  | {
      type: "inference";
      modality: Modality;
      model: string;
      qpsTarget: number;
      maxCostPerUnit?: number; // per-M-tokens (text) or per-M-images (image)
    };

export interface Result {
  passed: boolean;
  score: number; // 0–100
  bottleneck: Bottleneck;
  metrics: Metrics;
}

/** Options accepted by evaluators. `catalog` override exists for testing. */
export interface EvalOpts {
  catalog?: ComponentType[];
  modality?: Modality;
  intent?: "training" | "inference";
}
```

- [ ] **Step 6: Write the failing smoke test in `src/sim/__tests__/types.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import type { Build } from "../types";

describe("types", () => {
  it("a Build is plain serializable data (round-trips through JSON)", () => {
    const build: Build = {
      components: [
        { instanceId: "a1", typeId: "gpu-nvidia-h100", position: { x: 0, y: 0 } },
      ],
      connections: [],
    };
    const roundTripped = JSON.parse(JSON.stringify(build)) as Build;
    expect(roundTripped).toEqual(build);
  });
});
```

- [ ] **Step 7: Run the test to verify it passes**

Run: `npm test`
Expected: PASS (1 test). Confirms toolchain + types compile.

- [ ] **Step 8: Commit**

```bash
git add package.json tsconfig.json vitest.config.ts src/sim/types.ts src/sim/__tests__/types.test.ts package-lock.json
git commit -m "feat(sim): scaffold project and define core types"
```

---

### Task 2: Seed component catalog + validation

**Files:**
- Create: `src/sim/catalog.ts`
- Test: `src/sim/__tests__/catalog.test.ts`

**Interfaces:**
- Consumes: `ComponentType` from `./types`.
- Produces: `export const catalog: ComponentType[]`, `export const LAST_UPDATED: string`, `export const PRICING_DISCLAIMER: string`.

- [ ] **Step 1: Create `src/sim/catalog.ts`**

```ts
import type { ComponentType } from "./types";

export const LAST_UPDATED = "2026-06";
export const PRICING_DISCLAIMER =
  "Prices and specs are approximate and illustrative, not a live price feed.";

export const catalog: ComponentType[] = [
  // ---- Accelerators ----
  {
    id: "gpu-nvidia-a100",
    name: "NVIDIA A100 80GB",
    category: "accelerator",
    vendor: "NVIDIA",
    specs: { trainingTFLOPS: 312, inferenceQPS: 1000, vramGB: 80, trainEff: 1.0, inferEff: 1.0, imageEff: 1.0 },
    capex: 10000,
    footprint: { rackUnits: 1, weightKg: 2 },
    powerDraw: 400,
    heatOutput: 400,
  },
  {
    id: "gpu-nvidia-h100",
    name: "NVIDIA H100 SXM",
    category: "accelerator",
    vendor: "NVIDIA",
    specs: { trainingTFLOPS: 1000, inferenceQPS: 3000, vramGB: 80, trainEff: 1.0, inferEff: 1.0, imageEff: 1.0 },
    capex: 30000,
    footprint: { rackUnits: 1, weightKg: 3 },
    powerDraw: 700,
    heatOutput: 700,
  },
  {
    id: "gpu-amd-mi300x",
    name: "AMD Instinct MI300X",
    category: "accelerator",
    vendor: "AMD",
    specs: { trainingTFLOPS: 1300, inferenceQPS: 3200, vramGB: 192, trainEff: 1.0, inferEff: 1.0, imageEff: 1.0 },
    capex: 20000,
    footprint: { rackUnits: 1, weightKg: 3 },
    powerDraw: 750,
    heatOutput: 750,
  },
  {
    id: "acc-aws-trainium",
    name: "AWS Trainium",
    category: "accelerator",
    vendor: "AWS",
    specs: { trainingTFLOPS: 650, inferenceQPS: 500, vramGB: 96, trainEff: 1.0, inferEff: 0.4, imageEff: 0.4 },
    capex: 8000,
    footprint: { rackUnits: 1, weightKg: 2 },
    powerDraw: 500,
    heatOutput: 500,
  },
  {
    id: "acc-aws-inferentia",
    name: "AWS Inferentia",
    category: "accelerator",
    vendor: "AWS",
    specs: { trainingTFLOPS: 100, inferenceQPS: 2500, vramGB: 32, trainEff: 0.3, inferEff: 1.0, imageEff: 0.8 },
    capex: 5000,
    footprint: { rackUnits: 1, weightKg: 2 },
    powerDraw: 300,
    heatOutput: 300,
  },
  {
    id: "acc-google-tpu",
    name: "Google TPU v5",
    category: "accelerator",
    vendor: "Google",
    specs: { trainingTFLOPS: 900, inferenceQPS: 2800, vramGB: 95, trainEff: 1.0, inferEff: 0.95, imageEff: 0.9 },
    capex: 15000,
    footprint: { rackUnits: 1, weightKg: 2 },
    powerDraw: 600,
    heatOutput: 600,
  },
  // ---- CPU ----
  {
    id: "cpu-amd-epyc",
    name: "AMD EPYC 64-core",
    category: "cpu",
    vendor: "AMD",
    specs: { cores: 64, baseGHz: 2.4 },
    capex: 5000,
    footprint: { rackUnits: 1, weightKg: 1 },
    powerDraw: 300,
    heatOutput: 300,
  },
  // ---- Server ----
  {
    id: "server-2u",
    name: "8-GPU Server (8U)",
    category: "server",
    vendor: "Generic",
    specs: { acceleratorSlots: 8, cpuSlots: 2, ramGB: 1024, rackUnits: 8 },
    capex: 8000,
    footprint: { rackUnits: 8, weightKg: 50 },
    powerDraw: 200,
    heatOutput: 200,
  },
  // ---- Rack ----
  {
    id: "rack-42u",
    name: "42U Rack",
    category: "rack",
    vendor: "Generic",
    specs: { rackUnitCapacity: 42, powerCapacityKW: 30, weightCapacityKg: 1000 },
    capex: 2000,
    footprint: { areaSqM: 1.5, weightKg: 150 },
    powerDraw: 0,
    heatOutput: 0,
  },
  // ---- Power ----
  {
    id: "power-grid-feed",
    name: "Utility Grid Feed",
    category: "power",
    vendor: "Utility",
    specs: { capacityKW: 100, efficiency: 0.95, pricePerKWh: 0.1 },
    capex: 5000,
    footprint: { areaSqM: 2 },
    powerDraw: 0,
    heatOutput: 0,
  },
  {
    id: "power-ups",
    name: "UPS Battery Unit",
    category: "power",
    vendor: "Generic",
    specs: { capacityKW: 50, efficiency: 0.9 },
    capex: 15000,
    footprint: { rackUnits: 6, weightKg: 200 },
    powerDraw: 0,
    heatOutput: 0,
  },
  // ---- Cooling ----
  {
    id: "cooling-crac",
    name: "CRAC Air Unit",
    category: "cooling",
    vendor: "Generic",
    specs: { heatRemovalKW: 50 },
    capex: 20000,
    footprint: { areaSqM: 2, weightKg: 300 },
    powerDraw: 15000,
    heatOutput: 0,
  },
  {
    id: "cooling-liquid",
    name: "Liquid Cooling Loop",
    category: "cooling",
    vendor: "Generic",
    specs: { heatRemovalKW: 150 },
    capex: 60000,
    footprint: { areaSqM: 2, weightKg: 250 },
    powerDraw: 20000,
    heatOutput: 0,
  },
  // ---- Network ----
  {
    id: "net-tor-switch",
    name: "Top-of-Rack Switch",
    category: "network",
    vendor: "Generic",
    specs: { bandwidthGbps: 800, ports: 48 },
    capex: 12000,
    footprint: { rackUnits: 1, weightKg: 10 },
    powerDraw: 500,
    heatOutput: 500,
  },
  {
    id: "net-spine-switch",
    name: "Spine Switch",
    category: "network",
    vendor: "Generic",
    specs: { bandwidthGbps: 3200, ports: 64 },
    capex: 40000,
    footprint: { rackUnits: 2, weightKg: 15 },
    powerDraw: 1200,
    heatOutput: 1200,
  },
  // ---- Space ----
  {
    id: "space-floor-tile",
    name: "Data Hall Floor Tile",
    category: "space",
    vendor: "N/A",
    specs: { areaSqM: 10, powerDensityCapKWperSqM: 5 },
    capex: 1000,
    footprint: { areaSqM: 10 },
    powerDraw: 0,
    heatOutput: 0,
  },
];
```

- [ ] **Step 2: Write the failing validation test in `src/sim/__tests__/catalog.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { catalog, LAST_UPDATED, PRICING_DISCLAIMER } from "../catalog";

describe("catalog", () => {
  it("has a dated pricing disclaimer", () => {
    expect(LAST_UPDATED).toMatch(/^\d{4}-\d{2}$/);
    expect(PRICING_DISCLAIMER.toLowerCase()).toContain("approximate");
  });

  it("every `requires` reference resolves to a real component id", () => {
    const ids = new Set(catalog.map((c) => c.id));
    for (const c of catalog) {
      for (const req of c.requires ?? []) {
        expect(ids, `${c.id} requires ${req}`).toContain(req);
      }
    }
  });

  it("has no negative capex, powerDraw, or heatOutput", () => {
    for (const c of catalog) {
      expect(c.capex, c.id).toBeGreaterThanOrEqual(0);
      expect(c.powerDraw, c.id).toBeGreaterThanOrEqual(0);
      expect(c.heatOutput, c.id).toBeGreaterThanOrEqual(0);
    }
  });

  it("covers the required accelerator vendors", () => {
    const vendors = new Set(
      catalog.filter((c) => c.category === "accelerator").map((c) => c.vendor),
    );
    for (const v of ["NVIDIA", "AMD", "AWS", "Google"]) {
      expect(vendors).toContain(v);
    }
  });

  it("models chip specialization sweet spots", () => {
    const trainium = catalog.find((c) => c.id === "acc-aws-trainium")!;
    const inferentia = catalog.find((c) => c.id === "acc-aws-inferentia")!;
    expect(Number(trainium.specs.trainEff)).toBeGreaterThan(Number(trainium.specs.inferEff));
    expect(Number(inferentia.specs.inferEff)).toBeGreaterThan(Number(inferentia.specs.trainEff));
  });
});
```

- [ ] **Step 3: Run tests to verify catalog tests pass**

Run: `npm test`
Expected: PASS (all catalog tests green).

- [ ] **Step 4: Commit**

```bash
git add src/sim/catalog.ts src/sim/__tests__/catalog.test.ts
git commit -m "feat(sim): add seed component catalog with vendors and specialization"
```

---

### Task 3: Power, thermal, and network evaluators

**Files:**
- Create: `src/sim/evaluate.ts`
- Test: `src/sim/__tests__/evaluate.power-thermal-network.test.ts`

**Interfaces:**
- Consumes: `Build`, `ComponentType`, `Metrics` from `./types`; `catalog` from `./catalog`.
- Produces (all exported from `evaluate.ts`):
  - Constants: `SECONDS_PER_MONTH`, `HOURS_PER_MONTH`, `AMORTIZE_MONTHS`, `DEFAULT_PRICE_PER_KWH`, `IMAGE_COST_FACTOR`, `CLUSTER_BW_PER_ACCEL_GBPS`, `UNCONNECTED_TRAINING_PENALTY`, `MISMATCH_EFF_THRESHOLD` (all `number`).
  - `resolveInstances(build: Build, cat: ComponentType[]): { inst: PlacedComponent; type: ComponentType }[]`
  - `computePower(build: Build, cat: ComponentType[]): Metrics["power"]`
  - `computeThermal(build: Build, cat: ComponentType[]): Metrics["thermal"]`
  - `computeNetwork(build: Build, cat: ComponentType[]): Metrics["network"]`

- [ ] **Step 1: Write the failing test in `src/sim/__tests__/evaluate.power-thermal-network.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { computePower, computeThermal, computeNetwork } from "../evaluate";
import { catalog } from "../catalog";
import type { Build } from "../types";

function build(components: { typeId: string; id: string }[], connections = []): Build {
  return {
    components: components.map((c) => ({ instanceId: c.id, typeId: c.typeId, position: { x: 0, y: 0 } })),
    connections,
  };
}

describe("computePower", () => {
  it("sums draw in kW, reads supply, and reports deficit", () => {
    const b = build([
      { id: "g1", typeId: "gpu-nvidia-h100" }, // 700W
      { id: "s1", typeId: "server-2u" }, // 200W
      { id: "p1", typeId: "power-grid-feed" }, // 100 kW supply
    ]);
    const p = computePower(b, catalog);
    expect(p.drawKW).toBeCloseTo(0.9, 5);
    expect(p.supplyKW).toBe(100);
    expect(p.deficitKW).toBe(0);
  });

  it("flags a deficit when draw exceeds supply", () => {
    const b = build([
      { id: "c1", typeId: "cooling-liquid" }, // 20000W = 20kW
      { id: "p1", typeId: "power-ups" }, // 50 kW... still ok; add many
    ]);
    // 3 liquid loops = 60kW draw vs 50kW supply
    b.components.push(
      { instanceId: "c2", typeId: "cooling-liquid", position: { x: 0, y: 0 } },
      { instanceId: "c3", typeId: "cooling-liquid", position: { x: 0, y: 0 } },
    );
    const p = computePower(b, catalog);
    expect(p.drawKW).toBeCloseTo(60, 5);
    expect(p.supplyKW).toBe(50);
    expect(p.deficitKW).toBeCloseTo(10, 5);
  });

  it("reports n+1 redundancy when a spare source covers the load", () => {
    const b = build([
      { id: "g1", typeId: "gpu-nvidia-h100" }, // 0.7kW
      { id: "p1", typeId: "power-grid-feed" }, // 100kW
      { id: "p2", typeId: "power-grid-feed" }, // 100kW
    ]);
    const p = computePower(b, catalog);
    expect(p.redundancy).toBe("n+1");
  });
});

describe("computeThermal", () => {
  it("sums heat and cooling and reports a deficit", () => {
    const b = build([
      { id: "g1", typeId: "gpu-nvidia-h100" }, // 700W heat
      { id: "c1", typeId: "cooling-crac" }, // 50 kW removal, 0 heat
    ]);
    const t = computeThermal(b, catalog);
    expect(t.heatKW).toBeCloseTo(0.7, 5);
    expect(t.coolingKW).toBe(50);
    expect(t.deficitKW).toBe(0);
  });
});

describe("computeNetwork", () => {
  it("a single accelerator is always 'connected'", () => {
    const b = build([{ id: "g1", typeId: "gpu-nvidia-h100" }]);
    expect(computeNetwork(b, catalog).clusterConnected).toBe(true);
  });

  it("many accelerators need enough bisection bandwidth to cluster", () => {
    const accs = Array.from({ length: 4 }, (_, i) => ({ id: `g${i}`, typeId: "gpu-nvidia-h100" }));
    const noNet = build(accs);
    expect(computeNetwork(noNet, catalog).clusterConnected).toBe(false);

    const withSpine = build([...accs, { id: "n1", typeId: "net-spine-switch" }]); // 3200 Gbps
    const net = computeNetwork(withSpine, catalog);
    expect(net.bisectionGbps).toBe(3200);
    expect(net.clusterConnected).toBe(true); // 3200 >= 4 * 100
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — `computePower`/`computeThermal`/`computeNetwork` not exported from `../evaluate`.

- [ ] **Step 3: Create `src/sim/evaluate.ts` with constants and the three evaluators**

```ts
import type { Build, ComponentType, Metrics, PlacedComponent } from "./types";

export const SECONDS_PER_MONTH = 2_592_000; // 30 days
export const HOURS_PER_MONTH = 730;
export const AMORTIZE_MONTHS = 36;
export const DEFAULT_PRICE_PER_KWH = 0.1;
export const IMAGE_COST_FACTOR = 20; // an image costs ~20x a text unit of compute
export const CLUSTER_BW_PER_ACCEL_GBPS = 100;
export const UNCONNECTED_TRAINING_PENALTY = 0.25;
export const MISMATCH_EFF_THRESHOLD = 0.6;

export function resolveInstances(
  build: Build,
  cat: ComponentType[],
): { inst: PlacedComponent; type: ComponentType }[] {
  const idx = new Map(cat.map((c) => [c.id, c]));
  const out: { inst: PlacedComponent; type: ComponentType }[] = [];
  for (const inst of build.components) {
    const type = idx.get(inst.typeId);
    if (type) out.push({ inst, type });
  }
  return out;
}

function num(v: number | string | undefined, fallback = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export function computePower(build: Build, cat: ComponentType[]): Metrics["power"] {
  const items = resolveInstances(build, cat);
  const drawKW = items.reduce((s, { type }) => s + type.powerDraw, 0) / 1000;
  const powerItems = items.filter((x) => x.type.category === "power");
  const capacities = powerItems.map((x) => num(x.type.specs.capacityKW));
  const supplyKW = capacities.reduce((a, b) => a + b, 0);
  const deficitKW = Math.max(0, drawKW - supplyKW);
  const maxSingle = capacities.length ? Math.max(...capacities) : 0;
  const redundancy: "none" | "n+1" =
    powerItems.length >= 2 && supplyKW - maxSingle >= drawKW ? "n+1" : "none";
  return { drawKW, supplyKW, deficitKW, redundancy };
}

export function computeThermal(build: Build, cat: ComponentType[]): Metrics["thermal"] {
  const items = resolveInstances(build, cat);
  const heatKW = items.reduce((s, { type }) => s + type.heatOutput, 0) / 1000;
  const coolingKW = items
    .filter((x) => x.type.category === "cooling")
    .reduce((s, { type }) => s + num(type.specs.heatRemovalKW), 0);
  const deficitKW = Math.max(0, heatKW - coolingKW);
  return { heatKW, coolingKW, deficitKW };
}

export function computeNetwork(build: Build, cat: ComponentType[]): Metrics["network"] {
  const items = resolveInstances(build, cat);
  const bisectionGbps = items
    .filter((x) => x.type.category === "network")
    .reduce((s, { type }) => s + num(type.specs.bandwidthGbps), 0);
  const numAcc = items.filter((x) => x.type.category === "accelerator").length;
  const clusterConnected =
    numAcc <= 1 ? true : bisectionGbps >= numAcc * CLUSTER_BW_PER_ACCEL_GBPS;
  return { bisectionGbps, clusterConnected };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS (all power/thermal/network tests green).

- [ ] **Step 5: Commit**

```bash
git add src/sim/evaluate.ts src/sim/__tests__/evaluate.power-thermal-network.test.ts
git commit -m "feat(sim): add power, thermal, and network evaluators"
```

---

### Task 4: Compute-capacity evaluator (training vs inference, modality, specialization)

**Files:**
- Modify: `src/sim/evaluate.ts` (add `computeCompute`)
- Test: `src/sim/__tests__/evaluate.compute.test.ts`

**Interfaces:**
- Consumes: `computeNetwork` and the constants from `./evaluate`; `Metrics`, `Modality` from `./types`.
- Produces: `computeCompute(build: Build, cat: ComponentType[], modality: Modality, network: Metrics["network"]): Metrics["compute"]`

- [ ] **Step 1: Write the failing test in `src/sim/__tests__/evaluate.compute.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { computeCompute, computeNetwork } from "../evaluate";
import { catalog } from "../catalog";
import type { Build } from "../types";

function build(typeIds: string[]): Build {
  return {
    components: typeIds.map((typeId, i) => ({ instanceId: `i${i}`, typeId, position: { x: 0, y: 0 } })),
    connections: [],
  };
}

describe("computeCompute", () => {
  it("training collapses without interconnect; inference does not (the centerpiece lesson)", () => {
    const fourGpus = build(Array(4).fill("gpu-nvidia-h100"));
    const fourGpusNetworked = build([...Array(4).fill("gpu-nvidia-h100"), "net-spine-switch"]);

    const netA = computeNetwork(fourGpus, catalog);
    const netB = computeNetwork(fourGpusNetworked, catalog);

    const a = computeCompute(fourGpus, catalog, "text", netA);
    const b = computeCompute(fourGpusNetworked, catalog, "text", netB);

    // Inference is ~equal (embarrassingly parallel)
    expect(a.inferenceThroughput).toBeCloseTo(b.inferenceThroughput, 5);
    // Training diverges sharply (unconnected is penalized)
    expect(b.trainingThroughput).toBeGreaterThan(a.trainingThroughput * 2);
  });

  it("image modality serves far fewer outputs than text", () => {
    const b = build(Array(4).fill("gpu-nvidia-h100"));
    const net = computeNetwork(b, catalog);
    const text = computeCompute(b, catalog, "text", net);
    const image = computeCompute(b, catalog, "image", net);
    expect(image.modality).toBe("image");
    expect(image.inferenceThroughput).toBeLessThan(text.inferenceThroughput / 10);
  });

  it("applies chip specialization multipliers (Inferentia trains poorly)", () => {
    const inferentia = build(["acc-aws-inferentia"]); // trainEff 0.3
    const trainium = build(["acc-aws-trainium"]); // trainEff 1.0
    const netI = computeNetwork(inferentia, catalog);
    const netT = computeNetwork(trainium, catalog);
    const i = computeCompute(inferentia, catalog, "text", netI);
    const t = computeCompute(trainium, catalog, "text", netT);
    // Trainium (650 * 1.0) trains far better than Inferentia (100 * 0.3)
    expect(t.trainingThroughput).toBeGreaterThan(i.trainingThroughput * 5);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — `computeCompute` not exported.

- [ ] **Step 3: Add `computeCompute` to `src/sim/evaluate.ts`**

Append to `src/sim/evaluate.ts` (after `computeNetwork`). Reuse the existing module-private `num` helper and `resolveInstances`:

```ts
export function computeCompute(
  build: Build,
  cat: ComponentType[],
  modality: import("./types").Modality,
  network: Metrics["network"],
): Metrics["compute"] {
  const accs = resolveInstances(build, cat).filter((x) => x.type.category === "accelerator");

  const trainRaw = accs.reduce(
    (s, { type }) => s + num(type.specs.trainingTFLOPS) * num(type.specs.trainEff, 1),
    0,
  );
  const penalty = network.clusterConnected ? 1 : UNCONNECTED_TRAINING_PENALTY;
  const trainingThroughput = trainRaw * penalty;

  let inferenceThroughput: number;
  if (modality === "image") {
    inferenceThroughput =
      accs.reduce((s, { type }) => s + num(type.specs.inferenceQPS) * num(type.specs.imageEff, 1), 0) /
      IMAGE_COST_FACTOR;
  } else {
    inferenceThroughput = accs.reduce(
      (s, { type }) => s + num(type.specs.inferenceQPS) * num(type.specs.inferEff, 1),
      0,
    );
  }

  return { trainingThroughput, inferenceThroughput, modality };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS (compute tests green).

- [ ] **Step 5: Commit**

```bash
git add src/sim/evaluate.ts src/sim/__tests__/evaluate.compute.test.ts
git commit -m "feat(sim): add compute evaluator with modality and chip specialization"
```

---

### Task 5: Cost evaluator

**Files:**
- Modify: `src/sim/evaluate.ts` (add `computeCost`)
- Test: `src/sim/__tests__/evaluate.cost.test.ts`

**Interfaces:**
- Consumes: `computePower`, `computeCompute` outputs; constants from `./evaluate`.
- Produces: `computeCost(build: Build, cat: ComponentType[], power: Metrics["power"], compute: Metrics["compute"]): Metrics["cost"]`

- [ ] **Step 1: Write the failing test in `src/sim/__tests__/evaluate.cost.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { computeCost, computePower, computeCompute, computeNetwork } from "../evaluate";
import { catalog } from "../catalog";
import type { Build } from "../types";

function build(typeIds: string[]): Build {
  return {
    components: typeIds.map((typeId, i) => ({ instanceId: `i${i}`, typeId, position: { x: 0, y: 0 } })),
    connections: [],
  };
}

describe("computeCost", () => {
  it("sums capex and computes monthly energy opex", () => {
    const b = build(["gpu-nvidia-h100", "power-grid-feed"]); // 30000 + 5000 capex; 0.7kW draw
    const power = computePower(b, catalog);
    const net = computeNetwork(b, catalog);
    const compute = computeCompute(b, catalog, "text", net);
    const cost = computeCost(b, catalog, power, compute);

    expect(cost.capex).toBe(35000);
    // energy = 0.7 kW * 730 h * $0.10 = $51.10/mo
    expect(cost.opexPerMonth).toBeCloseTo(51.1, 1);
    expect(cost.costPerMillionTokens).toBeGreaterThan(0);
    expect(Number.isFinite(cost.costPerMillionTokens)).toBe(true);
  });

  it("a cheaper-per-token build has a lower costPerMillionTokens", () => {
    const expensive = build(["gpu-nvidia-h100", "power-grid-feed"]);
    const cheap = build(["acc-aws-inferentia", "power-grid-feed"]); // cheap chip, strong inference

    const ce = computeCost(
      expensive,
      catalog,
      computePower(expensive, catalog),
      computeCompute(expensive, catalog, "text", computeNetwork(expensive, catalog)),
    );
    const cc = computeCost(
      cheap,
      catalog,
      computePower(cheap, catalog),
      computeCompute(cheap, catalog, "text", computeNetwork(cheap, catalog)),
    );
    expect(cc.costPerMillionTokens).toBeLessThan(ce.costPerMillionTokens);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — `computeCost` not exported.

- [ ] **Step 3: Add `computeCost` to `src/sim/evaluate.ts`**

```ts
export function computeCost(
  build: Build,
  cat: ComponentType[],
  power: Metrics["power"],
  compute: Metrics["compute"],
): Metrics["cost"] {
  const items = resolveInstances(build, cat);
  const capex = items.reduce((s, { type }) => s + type.capex, 0);
  const fixedOpex = items.reduce((s, { type }) => s + (type.opexPerMonth ?? 0), 0);

  const priceCandidates = items
    .map((x) => num(x.type.specs.pricePerKWh))
    .filter((n) => n > 0);
  const pricePerKWh = priceCandidates.length ? Math.min(...priceCandidates) : DEFAULT_PRICE_PER_KWH;

  const energyOpex = power.drawKW * HOURS_PER_MONTH * pricePerKWh;
  const opexPerMonth = fixedOpex + energyOpex;
  const monthlyCost = opexPerMonth + capex / AMORTIZE_MONTHS;

  const dollarsPerTrainingUnit =
    compute.trainingThroughput > 0 ? monthlyCost / compute.trainingThroughput : Infinity;

  const unitsPerMonth = compute.inferenceThroughput * SECONDS_PER_MONTH;
  const costPerMillionTokens =
    unitsPerMonth > 0 ? monthlyCost / (unitsPerMonth / 1_000_000) : Infinity;

  return { capex, opexPerMonth, dollarsPerTrainingUnit, costPerMillionTokens };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS (cost tests green).

- [ ] **Step 5: Commit**

```bash
git add src/sim/evaluate.ts src/sim/__tests__/evaluate.cost.test.ts
git commit -m "feat(sim): add cost evaluator with USD opex and cost-per-million-tokens"
```

---

### Task 6: Space evaluator + violations

**Files:**
- Modify: `src/sim/evaluate.ts` (add `computeSpace`)
- Create: `src/sim/validate.ts`
- Test: `src/sim/__tests__/validate.test.ts`

**Interfaces:**
- Consumes: `resolveInstances`, `MISMATCH_EFF_THRESHOLD` from `./evaluate`; `Metrics`, `Violation`, `EvalOpts` from `./types`.
- Produces:
  - `computeSpace(build: Build, cat: ComponentType[]): Metrics["space"]` (in `evaluate.ts`)
  - `collectViolations(build: Build, cat: ComponentType[], parts: ViolationParts, opts: EvalOpts): Violation[]` (in `validate.ts`), where `ViolationParts = Pick<Metrics, "power" | "thermal" | "network" | "space">`.

- [ ] **Step 1: Add `computeSpace` to `src/sim/evaluate.ts`**

```ts
export function computeSpace(build: Build, cat: ComponentType[]): Metrics["space"] {
  const items = resolveInstances(build, cat);
  const usedSqM = items.reduce((s, { type }) => s + (type.footprint.areaSqM ?? 0), 0);
  const capSqM = build.landBudgetSqM;
  const overBudget = capSqM != null && usedSqM > capSqM;
  return { usedSqM, capSqM, overBudget };
}
```

- [ ] **Step 2: Write the failing test in `src/sim/__tests__/validate.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { collectViolations } from "../validate";
import {
  computePower,
  computeThermal,
  computeNetwork,
  computeSpace,
} from "../evaluate";
import { catalog } from "../catalog";
import type { Build, EvalOpts, Violation } from "../types";

function parts(b: Build) {
  return {
    power: computePower(b, catalog),
    thermal: computeThermal(b, catalog),
    network: computeNetwork(b, catalog),
    space: computeSpace(b, catalog),
  };
}

function codes(v: Violation[]) {
  return v.map((x) => x.code);
}

function build(comps: { id: string; typeId: string }[], connections: Build["connections"] = [], landBudgetSqM?: number): Build {
  return {
    components: comps.map((c) => ({ instanceId: c.id, typeId: c.typeId, position: { x: 0, y: 0 } })),
    connections,
    landBudgetSqM,
  };
}

describe("collectViolations", () => {
  const opts: EvalOpts = {};

  it("flags a power deficit", () => {
    const b = build([
      { id: "c1", typeId: "cooling-liquid" },
      { id: "c2", typeId: "cooling-liquid" },
      { id: "c3", typeId: "cooling-liquid" }, // 60kW
      { id: "p1", typeId: "power-ups" }, // 50kW
    ]);
    expect(codes(collectViolations(b, catalog, parts(b), opts))).toContain("power-deficit");
  });

  it("flags overheating", () => {
    const b = build([
      ...Array.from({ length: 100 }, (_, i) => ({ id: `g${i}`, typeId: "gpu-nvidia-h100" })),
      { id: "c1", typeId: "cooling-crac" }, // 50kW removal << 70kW heat
    ]);
    expect(codes(collectViolations(b, catalog, parts(b), opts))).toContain("overheating");
  });

  it("flags an unpowered component when not wired to power", () => {
    const b = build([{ id: "g1", typeId: "gpu-nvidia-h100" }]); // no power connection
    expect(codes(collectViolations(b, catalog, parts(b), opts))).toContain("unpowered-component");
  });

  it("does NOT flag unpowered when a power connection exists", () => {
    const b = build(
      [
        { id: "g1", typeId: "gpu-nvidia-h100" },
        { id: "p1", typeId: "power-grid-feed" },
      ],
      [{ from: "g1", to: "p1", kind: "power" }],
    );
    expect(codes(collectViolations(b, catalog, parts(b), opts))).not.toContain("unpowered-component");
  });

  it("warns about no network with multiple accelerators", () => {
    const b = build([
      { id: "g1", typeId: "gpu-nvidia-h100" },
      { id: "g2", typeId: "gpu-nvidia-h100" },
    ]);
    expect(codes(collectViolations(b, catalog, parts(b), opts))).toContain("no-network");
  });

  it("flags over-land when footprint exceeds the land budget", () => {
    const b = build([{ id: "t1", typeId: "space-floor-tile" }], [], 5); // 10 sqM > 5
    expect(codes(collectViolations(b, catalog, parts(b), opts))).toContain("over-land");
  });

  it("flags rack-overfull when servers exceed rack capacity", () => {
    // 6 servers * 8U = 48U demand vs one 42U rack
    const comps = [
      { id: "r1", typeId: "rack-42u" },
      ...Array.from({ length: 6 }, (_, i) => ({ id: `s${i}`, typeId: "server-2u" })),
    ];
    const b = build(comps);
    expect(codes(collectViolations(b, catalog, parts(b), opts))).toContain("rack-overfull");
  });

  it("flags weight-exceeded when components outweigh rack capacity", () => {
    // one 42U rack supports 1000kg; 400 H100s * 3kg = 1200kg > 1000kg
    const comps = [
      { id: "r1", typeId: "rack-42u" },
      ...Array.from({ length: 400 }, (_, i) => ({ id: `g${i}`, typeId: "gpu-nvidia-h100" })),
    ];
    const b = build(comps);
    expect(codes(collectViolations(b, catalog, parts(b), opts))).toContain("weight-exceeded");
  });

  it("raises a chip-mismatch WARNING (not error) for off-sweet-spot chips when intent is known", () => {
    const b = build([{ id: "x1", typeId: "acc-aws-inferentia" }]); // inferEff high, trainEff 0.3
    const v = collectViolations(b, catalog, parts(b), { intent: "training" });
    const mismatch = v.find((x) => x.code === "chip-mismatch");
    expect(mismatch).toBeDefined();
    expect(mismatch!.severity).toBe("warning");
  });

  it("does NOT raise chip-mismatch when intent is unknown", () => {
    const b = build([{ id: "x1", typeId: "acc-aws-inferentia" }]);
    expect(codes(collectViolations(b, catalog, parts(b), {}))).not.toContain("chip-mismatch");
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — `../validate` does not exist.

- [ ] **Step 4: Create `src/sim/validate.ts`**

```ts
import type { Build, ComponentType, EvalOpts, Metrics, Violation } from "./types";
import { MISMATCH_EFF_THRESHOLD, resolveInstances } from "./evaluate";

export type ViolationParts = Pick<Metrics, "power" | "thermal" | "network" | "space">;

function num(v: number | string | undefined, fallback = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export function collectViolations(
  build: Build,
  cat: ComponentType[],
  parts: ViolationParts,
  opts: EvalOpts,
): Violation[] {
  const v: Violation[] = [];
  const items = resolveInstances(build, cat);

  if (parts.power.deficitKW > 0) {
    v.push({
      code: "power-deficit",
      severity: "error",
      message: `Power short by ${parts.power.deficitKW.toFixed(1)} kW — add supply or a bigger feed.`,
      relatedInstanceIds: [],
    });
  }

  if (parts.thermal.deficitKW > 0) {
    v.push({
      code: "overheating",
      severity: "error",
      message: `Cooling short by ${parts.thermal.deficitKW.toFixed(1)} kW — heat is building up faster than it's removed.`,
      relatedInstanceIds: [],
    });
  }

  const poweredIds = new Set<string>();
  for (const c of build.connections) {
    if (c.kind === "power") {
      poweredIds.add(c.from);
      poweredIds.add(c.to);
    }
  }
  const needsPower = items.filter(
    (x) => x.type.category === "accelerator" || x.type.category === "server",
  );
  const unpowered = needsPower.filter((x) => !poweredIds.has(x.inst.instanceId));
  if (unpowered.length) {
    v.push({
      code: "unpowered-component",
      severity: "error",
      message: `${unpowered.length} component(s) aren't wired to power.`,
      relatedInstanceIds: unpowered.map((x) => x.inst.instanceId),
    });
  }

  const rackCapacity = items
    .filter((x) => x.type.category === "rack")
    .reduce((s, { type }) => s + num(type.specs.rackUnitCapacity), 0);
  const rackDemand = items
    .filter((x) => x.type.category === "server" || x.type.category === "accelerator")
    .reduce((s, { type }) => s + num(type.footprint.rackUnits), 0);
  if (rackDemand > rackCapacity) {
    v.push({
      code: "rack-overfull",
      severity: "error",
      message: `Racks are over capacity (${rackDemand}U needed, ${rackCapacity}U available).`,
      relatedInstanceIds: items
        .filter((x) => x.type.category === "rack")
        .map((x) => x.inst.instanceId),
    });
  }

  const weightCap = items
    .filter((x) => x.type.category === "rack")
    .reduce((s, { type }) => s + num(type.specs.weightCapacityKg), 0);
  const weight = items.reduce((s, { type }) => s + num(type.footprint.weightKg), 0);
  if (weightCap > 0 && weight > weightCap) {
    v.push({
      code: "weight-exceeded",
      severity: "error",
      message: `Total weight ${weight}kg exceeds rack limit ${weightCap}kg.`,
      relatedInstanceIds: [],
    });
  }

  const numAcc = items.filter((x) => x.type.category === "accelerator").length;
  if (numAcc >= 2 && parts.network.bisectionGbps === 0) {
    v.push({
      code: "no-network",
      severity: "warning",
      message: `Multiple accelerators but no networking — they can't train as one cluster.`,
      relatedInstanceIds: [],
    });
  }

  if (parts.space.overBudget) {
    v.push({
      code: "over-land",
      severity: "error",
      message: `Footprint ${parts.space.usedSqM}m² exceeds the ${parts.space.capSqM}m² land budget.`,
      relatedInstanceIds: [],
    });
  }

  if (opts.intent) {
    const effKey = opts.intent === "training" ? "trainEff" : "inferEff";
    const mismatched = items.filter(
      (x) =>
        x.type.category === "accelerator" &&
        num(x.type.specs[effKey], 1) < MISMATCH_EFF_THRESHOLD,
    );
    if (mismatched.length) {
      const better =
        opts.intent === "training"
          ? "a training-tuned chip (e.g. AWS Trainium or NVIDIA H100)"
          : "an inference-tuned chip (e.g. AWS Inferentia)";
      v.push({
        code: "chip-mismatch",
        severity: "warning",
        message: `Some chips are off their sweet spot for ${opts.intent} — ${better} would do more per dollar.`,
        relatedInstanceIds: mismatched.map((x) => x.inst.instanceId),
      });
    }
  }

  return v;
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test`
Expected: PASS (all validation tests green).

- [ ] **Step 6: Commit**

```bash
git add src/sim/evaluate.ts src/sim/validate.ts src/sim/__tests__/validate.test.ts
git commit -m "feat(sim): add space evaluator and violation detection"
```

---

### Task 7: Assemble `evaluateBuild`

**Files:**
- Modify: `src/sim/evaluate.ts` (add `evaluateBuild`)
- Test: `src/sim/__tests__/evaluate-build.test.ts`

**Interfaces:**
- Consumes: all `compute*` helpers, `collectViolations`, `catalog`.
- Produces: `evaluateBuild(build: Build, opts?: EvalOpts): Metrics`

- [ ] **Step 1: Write the failing test in `src/sim/__tests__/evaluate-build.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { evaluateBuild } from "../evaluate";
import type { Build } from "../types";

const wellFormed: Build = {
  components: [
    { instanceId: "g1", typeId: "gpu-nvidia-h100", position: { x: 0, y: 0 } },
    { instanceId: "p1", typeId: "power-grid-feed", position: { x: 1, y: 0 } },
    { instanceId: "c1", typeId: "cooling-crac", position: { x: 2, y: 0 } },
    { instanceId: "r1", typeId: "rack-42u", position: { x: 3, y: 0 } },
  ],
  connections: [{ from: "g1", to: "p1", kind: "power" }],
};

describe("evaluateBuild", () => {
  it("returns a fully populated Metrics object", () => {
    const m = evaluateBuild(wellFormed);
    expect(m.power.drawKW).toBeGreaterThan(0);
    expect(m.thermal.coolingKW).toBe(50);
    expect(m.compute.modality).toBe("text");
    expect(m.cost.capex).toBeGreaterThan(0);
    expect(m.network).toHaveProperty("clusterConnected");
    expect(m.space).toHaveProperty("usedSqM");
    expect(Array.isArray(m.violations)).toBe(true);
  });

  it("a healthy single-GPU build has no error violations", () => {
    const m = evaluateBuild(wellFormed);
    expect(m.violations.filter((v) => v.severity === "error")).toHaveLength(0);
  });

  it("respects an explicit modality option", () => {
    expect(evaluateBuild(wellFormed, { modality: "image" }).compute.modality).toBe("image");
  });

  it("is deterministic (same input → identical output)", () => {
    expect(evaluateBuild(wellFormed)).toEqual(evaluateBuild(wellFormed));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — `evaluateBuild` not exported.

- [ ] **Step 3: Add `evaluateBuild` to `src/sim/evaluate.ts`**

Add this import at the top of `evaluate.ts` (alongside the existing type import) and the `catalog` import:

```ts
import { catalog as defaultCatalog } from "./catalog";
import { collectViolations } from "./validate";
import type { EvalOpts } from "./types";
```

Then append:

```ts
export function evaluateBuild(build: Build, opts: EvalOpts = {}): Metrics {
  const cat = opts.catalog ?? defaultCatalog;
  const modality = opts.modality ?? "text";

  const power = computePower(build, cat);
  const thermal = computeThermal(build, cat);
  const network = computeNetwork(build, cat);
  const compute = computeCompute(build, cat, modality, network);
  const cost = computeCost(build, cat, power, compute);
  const space = computeSpace(build, cat);
  const violations = collectViolations(build, cat, { power, thermal, network, space }, opts);

  return { power, thermal, compute, cost, network, space, violations };
}
```

> Note: `evaluate.ts` importing `validate.ts` and `validate.ts` importing from `evaluate.ts` is a cycle limited to a function (`collectViolations`) and constants — safe under ESM because the values are only read at call time, not at module top-level. Do not move `MISMATCH_EFF_THRESHOLD` or `resolveInstances` into call-time-only positions; they are already module-level constants/functions and resolve fine.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS (evaluate-build tests green, all prior tests still green).

- [ ] **Step 5: Run the typechecker**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/sim/evaluate.ts src/sim/__tests__/evaluate-build.test.ts
git commit -m "feat(sim): assemble evaluateBuild composing all metric slices"
```

---

### Task 8: `evaluateAgainstWorkload`

**Files:**
- Create: `src/sim/workload.ts`
- Test: `src/sim/__tests__/workload.test.ts`

**Interfaces:**
- Consumes: `evaluateBuild`, `resolveInstances` from `./evaluate`; `catalog`; `Build`, `Workload`, `Result`, `Bottleneck`, `EvalOpts` from `./types`.
- Produces: `evaluateAgainstWorkload(build: Build, workload: Workload, opts?: EvalOpts): Result`

- [ ] **Step 1: Write the failing test in `src/sim/__tests__/workload.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { evaluateAgainstWorkload } from "../workload";
import type { Build, Workload } from "../types";

function gpus(n: number, extra: string[] = []): Build {
  return {
    components: [
      ...Array.from({ length: n }, (_, i) => ({ instanceId: `g${i}`, typeId: "gpu-nvidia-h100", position: { x: 0, y: 0 } })),
      ...extra.map((typeId, i) => ({ instanceId: `e${i}`, typeId, position: { x: 0, y: 0 } })),
    ],
    connections: Array.from({ length: n }, (_, i) => ({ from: `g${i}`, to: "e0", kind: "power" as const })),
  };
}

describe("evaluateAgainstWorkload", () => {
  it("passes an inference workload when throughput meets the target", () => {
    const build = gpus(2, ["power-grid-feed"]); // 2 * 3000 = 6000 QPS
    const wl: Workload = { type: "inference", modality: "text", model: "ChatGPT-ish", qpsTarget: 5000 };
    const r = evaluateAgainstWorkload(build, wl);
    expect(r.passed).toBe(true);
    expect(r.bottleneck).toBeNull();
    expect(r.score).toBeGreaterThanOrEqual(60);
  });

  it("fails inference on compute when throughput is short", () => {
    const build = gpus(1, ["power-grid-feed"]); // 3000 QPS
    const wl: Workload = { type: "inference", modality: "text", model: "x", qpsTarget: 5000 };
    const r = evaluateAgainstWorkload(build, wl);
    expect(r.passed).toBe(false);
    expect(r.bottleneck).toBe("compute");
    expect(r.score).toBeLessThan(50);
  });

  it("fails inference on affordability when too expensive per unit", () => {
    const build = gpus(2, ["power-grid-feed"]);
    const wl: Workload = {
      type: "inference",
      modality: "text",
      model: "x",
      qpsTarget: 5000,
      maxCostPerUnit: 0.0001, // unrealistically strict → fails affordability
    };
    const r = evaluateAgainstWorkload(build, wl);
    expect(r.passed).toBe(false);
    expect(r.bottleneck).toBe("affordability");
  });

  it("fails training on network when GPUs aren't interconnected", () => {
    const build = gpus(4, ["power-grid-feed"]); // no switch → not clustered
    const wl: Workload = { type: "training", modality: "text", modelSizeB: 70, targetThroughput: 3000 };
    const r = evaluateAgainstWorkload(build, wl);
    expect(r.passed).toBe(false);
    expect(r.bottleneck).toBe("network");
  });

  it("fails training on budget when over the GPU budget", () => {
    const build = gpus(4, ["power-grid-feed", "net-spine-switch"]);
    const wl: Workload = { type: "training", modality: "text", modelSizeB: 70, gpuBudget: 2 };
    const r = evaluateAgainstWorkload(build, wl);
    expect(r.passed).toBe(false);
    expect(r.bottleneck).toBe("budget");
  });

  it("prioritizes hard errors (power) over capacity shortfalls", () => {
    // Many GPUs, tiny power → power-deficit error dominates
    const build = gpus(100, ["power-ups"]);
    const wl: Workload = { type: "inference", modality: "text", model: "x", qpsTarget: 1 };
    const r = evaluateAgainstWorkload(build, wl);
    expect(r.passed).toBe(false);
    expect(r.bottleneck).toBe("power");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — `../workload` does not exist.

- [ ] **Step 3: Create `src/sim/workload.ts`**

```ts
import type { Bottleneck, Build, EvalOpts, Result, Workload } from "./types";
import { catalog as defaultCatalog } from "./catalog";
import { evaluateBuild, resolveInstances } from "./evaluate";

function bottleneckForError(code: string): Bottleneck {
  switch (code) {
    case "power-deficit":
    case "unpowered-component":
      return "power";
    case "overheating":
      return "cooling";
    case "over-land":
    case "rack-overfull":
    case "weight-exceeded":
      return "space";
    default:
      return "compute";
  }
}

export function evaluateAgainstWorkload(
  build: Build,
  workload: Workload,
  opts: EvalOpts = {},
): Result {
  const cat = opts.catalog ?? defaultCatalog;
  const metrics = evaluateBuild(build, {
    ...opts,
    modality: workload.modality,
    intent: workload.type,
  });

  const errors = metrics.violations.filter((v) => v.severity === "error");

  let passed = true;
  let bottleneck: Bottleneck = null;

  if (errors.length) {
    passed = false;
    bottleneck = bottleneckForError(errors[0].code);
  } else if (workload.type === "training") {
    const numAcc = resolveInstances(build, cat).filter(
      (x) => x.type.category === "accelerator",
    ).length;
    if (workload.gpuBudget != null && numAcc > workload.gpuBudget) {
      passed = false;
      bottleneck = "budget";
    } else if (!metrics.network.clusterConnected) {
      passed = false;
      bottleneck = "network";
    } else if (
      workload.targetThroughput != null &&
      metrics.compute.trainingThroughput < workload.targetThroughput
    ) {
      passed = false;
      bottleneck = "compute";
    } else if (metrics.compute.trainingThroughput <= 0) {
      passed = false;
      bottleneck = "compute";
    }
  } else {
    // inference
    if (metrics.compute.inferenceThroughput < workload.qpsTarget) {
      passed = false;
      bottleneck = "compute";
    } else if (
      workload.maxCostPerUnit != null &&
      metrics.cost.costPerMillionTokens > workload.maxCostPerUnit
    ) {
      passed = false;
      bottleneck = "affordability";
    }
  }

  let score: number;
  if (!passed) {
    let progress = 0;
    if (workload.type === "inference" && workload.qpsTarget > 0) {
      progress = metrics.compute.inferenceThroughput / workload.qpsTarget;
    } else if (workload.type === "training" && workload.targetThroughput) {
      progress = metrics.compute.trainingThroughput / workload.targetThroughput;
    }
    score = Math.max(0, Math.min(49, Math.round(progress * 49)));
  } else {
    const warnings = metrics.violations.filter((v) => v.severity === "warning").length;
    score = Math.max(60, 100 - warnings * 10);
  }

  return { passed, score, bottleneck, metrics };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS (all workload tests green).

- [ ] **Step 5: Commit**

```bash
git add src/sim/workload.ts src/sim/__tests__/workload.test.ts
git commit -m "feat(sim): add evaluateAgainstWorkload with pass/fail, bottleneck, score"
```

---

### Task 9: Public API entry point

**Files:**
- Create: `src/sim/index.ts`
- Test: `src/sim/__tests__/index.test.ts`

**Interfaces:**
- Consumes: `catalog`, `evaluateBuild`, `evaluateAgainstWorkload`, and all types.
- Produces: the public surface — `catalog`, `evaluateBuild`, `evaluateAgainstWorkload`, plus re-exported types and `LAST_UPDATED`, `PRICING_DISCLAIMER`.

- [ ] **Step 1: Write the failing test in `src/sim/__tests__/index.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import * as sim from "../index";
import type { Build, Workload } from "../index";

describe("public API", () => {
  it("exposes catalog, evaluateBuild, evaluateAgainstWorkload, and disclaimer", () => {
    expect(Array.isArray(sim.catalog)).toBe(true);
    expect(typeof sim.evaluateBuild).toBe("function");
    expect(typeof sim.evaluateAgainstWorkload).toBe("function");
    expect(typeof sim.PRICING_DISCLAIMER).toBe("string");
  });

  it("runs an end-to-end ChatGPT-style inference scenario", () => {
    const build: Build = {
      components: [
        { instanceId: "g0", typeId: "gpu-nvidia-h100", position: { x: 0, y: 0 } },
        { instanceId: "g1", typeId: "gpu-nvidia-h100", position: { x: 0, y: 1 } },
        { instanceId: "p0", typeId: "power-grid-feed", position: { x: 1, y: 0 } },
        { instanceId: "c0", typeId: "cooling-crac", position: { x: 2, y: 0 } },
      ],
      connections: [
        { from: "g0", to: "p0", kind: "power" },
        { from: "g1", to: "p0", kind: "power" },
      ],
    };
    const wl: Workload = { type: "inference", modality: "text", model: "ChatGPT-ish", qpsTarget: 5000 };
    const result = sim.evaluateAgainstWorkload(build, wl);
    expect(result.passed).toBe(true);
    expect(result.metrics.cost.costPerMillionTokens).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — `../index` does not exist.

- [ ] **Step 3: Create `src/sim/index.ts`**

```ts
export { catalog, LAST_UPDATED, PRICING_DISCLAIMER } from "./catalog";
export { evaluateBuild } from "./evaluate";
export { evaluateAgainstWorkload } from "./workload";
export type * from "./types";
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS (all tests across all files green).

- [ ] **Step 5: Run the full suite and typecheck**

Run: `npm test && npm run typecheck`
Expected: all tests PASS; no type errors.

- [ ] **Step 6: Commit**

```bash
git add src/sim/index.ts src/sim/__tests__/index.test.ts
git commit -m "feat(sim): expose public API entry point"
```

---

## Done criteria (maps to spec §4 success criteria)

1. ✅ `evaluateBuild` and `evaluateAgainstWorkload` pure, deterministic, exported from `src/sim/index.ts` (Tasks 7–9; determinism test in Task 7).
2. ✅ Seed catalog spans vendors/eras/specializations (Task 2).
3. ✅ All eight violation codes detectable and unit-tested (Task 6 asserts all eight: power-deficit, overheating, unpowered-component, no-network, over-land, rack-overfull, weight-exceeded, chip-mismatch).
4. ✅ Training-vs-inference divergence, modality, specialization, and `costPerMillionTokens` each asserted (Tasks 4–5).
5. ✅ Meaningful coverage of §3.4 relationships (Tasks 3–6).
6. ✅ No DOM/render/network/persistence in `src/sim` (Global Constraints; enforced by review).
