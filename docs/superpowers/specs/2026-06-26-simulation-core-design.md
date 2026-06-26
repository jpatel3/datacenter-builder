# Design: Data Center Builder — Simulation Core

**Date:** 2026-06-26
**Status:** Approved (design phase)
**Scope of this doc:** The first subsystem — the headless simulation core + component/pricing data model. The overall project architecture is summarized for context, but only the simulation core is specified for implementation here.

---

## 1. Project context

**What we're building:** A standalone, browser-based educational *game* in which the player builds data centers and learns what actually goes into one — chips, racks, power, cooling, networking, land — and how those choices trade off on cost, capacity, and the difference between training and inference workloads.

**Not affiliated with Tuva.** This is a separate standalone application. We are free to design it from scratch; the Tuva energy-machine sim was only a stylistic reference point, not a constraint.

**Audience:** College students and early-career tech people. Implication: numbers and vendor names should be *realistic-ish* — right ballpark, correct ratios, real vendors (NVIDIA, etc.) — and training-vs-inference tradeoffs must be meaningful. It does not need engineering-grade accuracy.

**Game shape (decided during brainstorming):**
- A **campaign of escalating challenges** — each scenario level unlocks new components and teaches one concept (startup rack → GPU cluster → hyperscale region).
- A **guided "course" mode** — block-by-block lessons that start simple and grow more complex.
- An **open exploration / sandbox mode** — unlocked as the player progresses, for free building.
- **Adaptive visual fidelity** — simple steps use lightweight 2D; complexity escalates only where a concept demands it.
- **Accounts + saved progress** via managed auth (Supabase social sign-in + Postgres).

## 2. Overall architecture (context)

Four largely independent subsystems, each to get its own spec → plan → implementation cycle:

| # | Subsystem | Responsibility | Depends on |
|---|-----------|----------------|------------|
| 1 | **Simulation core** *(this doc)* | Headless engine + component/pricing data. Computes power, heat, cost, capacity, networking, violations; grades builds against workloads. | nothing |
| 2 | Game canvas + building UX | Isometric 2D grid (PixiJS); place/connect/delete components; live readouts. | 1 |
| 3 | Curriculum / campaign | Declarative lesson + scenario definitions, guided steps, unlocks, hints; sandbox mode. | 1, 2 |
| 4 | Accounts + persistence | Supabase social auth; save/load builds and progress. | 1, 2, 3 |

**Recommended overall tech:** TypeScript throughout; **PixiJS** for the isometric canvas (fast 2D WebGL, leaves a clean path to a richer/3D layer via Three.js for "complex" moments); **React** for the shell (lesson narration, HUD, vendor/pricing catalog browser); **Supabase** for auth + Postgres; **Vite** build.

**Build order:** Simulation core first — it is the educational heart, is fully testable headless, and de-risks the hardest question ("are the numbers and tradeoffs believable?") before any graphics work. Then canvas → curriculum → accounts.

---

## 3. Simulation core — detailed design

### 3.1 Purpose and boundaries

A deterministic, headless TypeScript module. Given a **build** (placed components + how they connect), it computes the metrics the player is graded on and evaluates a build against a **workload**. Pure functions, no DOM, no randomness, fully unit-tested.

**Modeling decisions (locked):**
- **Steady-state snapshot**, not a time-stepped simulation. The engine evaluates the build's current state instantly — totals, capacities, violations. No heat-over-time, UPS drain, or cascading failures in v1. (A dynamic layer can be added later on top of this model.)
- **Credible but simplified** physics and pricing. Numbers land in the right ballpark with correct ratios (an H100 really draws ~700W; cooling capacity must exceed heat output); formulas are simplified, not engineering-grade.

**Explicitly out of scope for this subsystem:** rendering, UI, accounts, campaign content (beyond a small example workload used in tests), and any time-based dynamics.

### 3.2 Component catalog (data, not code)

A versioned, dated data file of component **types**. Each type is a plain record:

```ts
interface ComponentType {
  id: string;                 // stable key, e.g. "gpu-nvidia-h100"
  name: string;               // "NVIDIA H100 SXM"
  category: Category;         // see below
  vendor: string;             // "NVIDIA"
  specs: Record<string, number | string>; // category-specific (see below)
  capex: number;              // purchase cost, USD
  opexPerMonth?: number;      // fixed monthly cost if any (maintenance/license)
  footprint: { rackUnits?: number; areaSqM?: number; weightKg?: number };
  powerDraw: number;          // watts drawn at load (0 for passive)
  heatOutput: number;         // watts of heat produced (≈ powerDraw for compute)
  requires?: string[];        // category/ids this needs to function (e.g. a rack, a network link)
}

type Category =
  | "accelerator"   // GPU/TPU
  | "cpu"
  | "server"        // node that hosts accelerators + cpu + ram
  | "rack"          // holds servers; rack-unit/power/weight limits
  | "power"         // PSU, PDU, UPS, generator, grid feed
  | "cooling"       // CRAC/CRAH, liquid loop, chiller
  | "network"       // switch (ToR/spine), cabling
  | "space";        // floor tile / room / building
```

**Category-specific `specs` (illustrative):**
- **accelerator:** `trainingTFLOPS`, `inferenceQPS`, `vramGB`.
- **cpu:** `cores`, `baseGHz`.
- **server:** `acceleratorSlots`, `cpuSlots`, `ramGB`, `rackUnits`.
- **rack:** `rackUnitCapacity`, `powerCapacityKW`, `weightCapacityKg`.
- **power:** `capacityKW`, `efficiency` (0–1), and for grid feed an opex driver `pricePerKWh`.
- **cooling:** `heatRemovalKW` (its own `powerDraw` is the cost of cooling).
- **network:** `bandwidthGbps`, `ports`.
- **space:** `areaSqM`, `powerDensityCapKWperSqM`.

**Pricing data** lives in this same catalog file, carries a `lastUpdated` date and a clearly-stated disclaimer ("approximate / illustrative, not a live price feed"), and is structured so a single edit updates a price everywhere.

### 3.3 Build model (plain serializable data)

```ts
interface PlacedComponent {
  instanceId: string;
  typeId: string;             // -> ComponentType.id
  position: { x: number; y: number }; // grid coords; the canvas maps these 1:1
  config?: Record<string, unknown>;   // e.g. how many accelerators populated in a server
}

interface Connection {
  from: string;               // instanceId
  to: string;                 // instanceId
  kind: "power" | "network";
}

interface Build {
  components: PlacedComponent[];
  connections: Connection[];
  landBudgetSqM?: number;     // optional cap supplied by a scenario
}
```

Keeping the build as plain data (not engine-internal objects) means the canvas renders it directly and Supabase saves it verbatim later, with no translation layer.

### 3.4 Engine outputs — `evaluateBuild(build): Metrics`

```ts
interface Metrics {
  power: {
    drawKW: number; supplyKW: number; deficitKW: number; // >0 means under-powered
    redundancy: "none" | "n+1";        // simplified: detect a spare power source
  };
  thermal: { heatKW: number; coolingKW: number; deficitKW: number };
  compute: {
    trainingThroughput: number;        // effective, after networking penalty
    inferenceThroughput: number;       // effective QPS
  };
  cost: {
    capex: number;
    opexPerMonth: number;              // power (drawKW * 730h * $/kWh) + cooling + fixed
    dollarsPerTrainingUnit: number;    // efficiency metric for comparisons
    costPerMillionTokens: number;      // INFERENCE AFFORDABILITY — first-class metric, USD.
                                       // (amortized capex + opex) / token throughput.
                                       // All engine costs are USD; narrative may cite a
                                       // source's original currency for flavor (e.g.
                                       // BharatGen ₹5 vs ~₹13/M tokens) but the metric is $.
  };
  network: {
    bisectionGbps: number;             // simplified aggregate interconnect
    clusterConnected: boolean;         // enough interconnect to train as one unit?
  };
  space: { usedSqM: number; capSqM?: number; overBudget: boolean };
  violations: Violation[];
}

interface Violation {
  code: "power-deficit" | "overheating" | "rack-overfull"
      | "no-network" | "over-land" | "unpowered-component" | "weight-exceeded";
  severity: "error" | "warning";
  message: string;                     // human-readable, used as lesson feedback
  relatedInstanceIds: string[];
}
```

**Key simplified relationships (the teaching content):**
- **Power:** `drawKW = Σ powerDraw + cooling power`. `deficit = draw − supply`. Under-power → `power-deficit` violation.
- **Thermal:** `heatKW = Σ heatOutput`. Cooling must satisfy `coolingKW ≥ heatKW`, else `overheating`.
- **Training vs inference (the centerpiece):** inference throughput scales ~linearly with accelerator count (embarrassingly parallel). Training throughput scales with accelerator count *only while the cluster is sufficiently interconnected*; if `bisectionGbps` is below a per-accelerator threshold, training throughput is penalized (and `clusterConnected = false`). This makes networking matter for training but barely for inference — the intended lesson.
- **Cost:** capex = Σ capex; opex = energy (`drawKW × 730 × pricePerKWh`) + fixed opex. Efficiency metrics enable "GPU A vs GPU B per dollar" comparisons.

### 3.5 Workload evaluation — `evaluateAgainstWorkload(build, workload): Result`

```ts
type Workload =
  | { type: "training"; modelSizeB: number; gpuBudget?: number; targetThroughput?: number }
  | { type: "inference"; model: string; qpsTarget: number; maxCostPerMillionTokens?: number };

interface Result {
  passed: boolean;
  score: number;                 // 0–100, e.g. headroom + cost-efficiency
  bottleneck:                    // the single most limiting factor, for hints
    "power" | "cooling" | "network" | "compute" | "space" | "budget"
    | "affordability" | null;    // "affordability" = fails maxCostPerMillionTokens
  metrics: Metrics;              // full metrics included
}
```

The campaign (subsystem 3) supplies the workload and a budget; this function returns pass/fail + the limiting bottleneck, which drives guided-mode hints and grading.

**Real-world-inspired scenarios.** Because the engine outputs `costPerMillionTokens` and accepts `gpuBudget` / `maxCostPerMillionTokens` constraints, campaign challenges can be modeled directly on real, named systems — a core teaching hook for this audience. Two complementary scenario flavors:

- **"What does it take to train *this* model?"** — reverse-engineer the infrastructure behind a flagship model: roughly how many accelerators, of what kind, for how long, drawing how much power, at what cost, and *what physically goes in* (racks, interconnect, cooling, power). Good seed candidates: **GPT-3-class (~175B)**, **DeepSeek-V3** (its technical report publishes GPU-hours), and **Llama-class** models — all of which have published or well-estimated infra figures.
- **Affordability targets** — e.g. *"BharatGen: train ~1T params within a ~2,400-GPU budget, then serve inference at the affordability frontier"* — beating a baseline cost-per-million-tokens.

**Accuracy & honesty rule (applies to scenario data):** closed models (e.g. GPT-4o, Anthropic models) have no public training setup; their scenarios use **publicly reported or estimated figures, explicitly labeled "approximate / estimated."** Models with published details are preferred for the highest-credibility levels. Every scenario carries a citation/disclaimer field.

These scenarios live in subsystem 3 (curriculum); this subsystem only needs to expose the metrics and constraints that make them expressible — which the API above does — and a catalog with **era-appropriate accelerators** (e.g. A100 for older training runs, H100/H200 for current) so the reconstructions are believable.

### 3.6 Public API (the interface other subsystems consume)

```ts
export const catalog: ComponentType[];           // all types + vendor/pricing data
export function evaluateBuild(build: Build): Metrics;
export function evaluateAgainstWorkload(build: Build, workload: Workload): Result;
```

Builds are manipulated as plain data by callers; the engine offers only pure evaluators. (Optional thin helpers like `addComponent`/`connect` may be added if convenient, but are not required by the API contract.)

### 3.7 Determinism & testing

- All functions pure; no randomness, no clock, no I/O.
- **Golden tests:** hand-computed fixture builds → asserted `Metrics`.
- **Per-rule tests:** one focused test per violation code (under-power, overheat, rack overfull, missing network, over land, weight).
- **Training-vs-inference test:** two builds with identical accelerators but different networking produce ~equal inference throughput and divergent training throughput (the core lesson, asserted).
- **Catalog validation test:** every `requires` reference resolves; no negative specs.

### 3.8 Suggested module layout

```
src/sim/
  catalog.ts        // ComponentType[] + pricing, dated, disclaimer
  types.ts          // Build, ComponentType, Metrics, Workload, Result interfaces
  evaluate.ts       // evaluateBuild()
  workload.ts       // evaluateAgainstWorkload()
  validate.ts       // violation detection rules
  index.ts          // public API re-exports
src/sim/__tests__/   // vitest unit tests
```

---

## 4. Success criteria for this subsystem

1. `evaluateBuild` and `evaluateAgainstWorkload` are pure, deterministic, and exported from a single entry point.
2. A seed catalog exists with at least: 2–3 accelerators spanning eras (e.g. an A100-class and an H100/H200-class part so historical and current training runs are both expressible), 1 CPU, 1 server, 1 rack, 2 power options, 2 cooling options, 1–2 switches, 1 space type — each with realistic-ballpark specs, vendor, and dated USD pricing + disclaimer.
3. All seven violation codes are detectable and unit-tested.
4. The training-vs-inference divergence is demonstrably modeled and asserted by a test, and `costPerMillionTokens` is computed and asserted (so affordability scenarios like BharatGen are expressible).
5. Test suite passes with meaningful coverage of the relationships in §3.4.
6. No DOM, rendering, network, or persistence code is present in `src/sim`.
