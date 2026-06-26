# Data Center Builder

A standalone, browser-based educational game where you build AI data centers and learn what actually goes into one — chips, racks, power, cooling, networking, land — and how those choices trade off on **cost, capacity, and the difference between training and inference** (and text vs. image workloads).

Aimed at college / early-career tech learners. Numbers and vendor names are realistic-ish (NVIDIA, AMD, AWS Trainium/Inferentia, Google TPU) but simplified for intuition, not engineering-grade accuracy.

## Status

Early development. Building in subsystems:

1. **Simulation core** — ✅ implemented. Headless, deterministic engine + component/pricing catalog.
2. **Playground UI (Vite)** — ✅ implemented. Add parts, pick a scenario, watch live metrics. `npm run dev`.
3. **Curriculum (Modules 1–3)** — ✅ implemented. Guided "Learn" mode (Teach/Task/Challenge/Reflect), component unlocks, bottleneck-keyed hints, localStorage progress; plus free "Sandbox" mode.
4. Isometric game canvas (the "Minecraft feel") — planned.
5. Accounts + persistence + sharing (Supabase) — designed.

Run `npm run dev` and open the local URL. **Learn** mode walks you from "your first chip" through power/cooling to "why training needs a network." **Sandbox** unlocks every part for free building (Serve ChatGPT, Serve Midjourney, Train a model).

See `docs/superpowers/specs/` for designs and `docs/superpowers/plans/` for implementation plans.

## Simulation core

Pure TypeScript, no DOM. A *build* is plain serializable data; pure evaluators compute the truth.

```ts
import { catalog, evaluateBuild, evaluateAgainstWorkload } from "./src/sim";

const build = {
  components: [
    { instanceId: "g0", typeId: "gpu-nvidia-h100", position: { x: 0, y: 0 } },
    { instanceId: "p0", typeId: "power-grid-feed", position: { x: 1, y: 0 } },
    { instanceId: "c0", typeId: "cooling-crac", position: { x: 2, y: 0 } },
  ],
  connections: [{ from: "g0", to: "p0", kind: "power" }],
};

const metrics = evaluateBuild(build);
// → power / thermal / compute / cost / network / space / violations

const result = evaluateAgainstWorkload(build, {
  type: "inference", modality: "text", model: "ChatGPT-ish", qpsTarget: 5000,
});
// → { passed, score, bottleneck, metrics }
```

What it models (credible but simplified, steady-state):

- **Power** draw vs. supply, deficit, n+1 redundancy.
- **Thermal** heat vs. cooling capacity.
- **Compute** training vs. inference throughput — training collapses without enough interconnect; inference scales linearly. **Image** workloads cost far more compute per output than text.
- **Chip specialization** — Trainium shines at training, Inferentia at serving; using a chip off its sweet spot still works but raises a friendly `chip-mismatch` warning (never a hard block).
- **Cost** — capex, monthly opex (USD), and **cost-per-million-tokens** (the affordability metric real-world systems are judged on).
- **Violations** — power deficit, overheating, unpowered components, rack overfull, weight, missing network, over land budget, chip mismatch.

## Develop

```bash
npm install
npm test         # vitest
npm run typecheck
```
