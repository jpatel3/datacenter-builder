import { describe, it, expect } from "vitest";
import { evaluateAgainstWorkload } from "../workload";
import type { Build, Workload } from "../types";

/**
 * Build a GPU rig. By default it is adequately powered (grid feed) and cooled
 * (liquid loop) so the dimension under test is the only thing that can fail.
 * Set `power`/`cooling` to null to intentionally starve that resource.
 */
function rig(
  n: number,
  opts: { extra?: string[]; power?: string | null; cooling?: string | null } = {},
): Build {
  const { extra = [], power = "power-grid-feed", cooling = "cooling-liquid" } = opts;
  const components = [
    ...Array.from({ length: n }, (_, i) => ({ instanceId: `g${i}`, typeId: "gpu-nvidia-h100", position: { x: 0, y: 0 } })),
    ...(power ? [{ instanceId: "pwr", typeId: power, position: { x: 0, y: 0 } }] : []),
    ...(cooling ? [{ instanceId: "cool", typeId: cooling, position: { x: 0, y: 0 } }] : []),
    ...extra.map((typeId, i) => ({ instanceId: `e${i}`, typeId, position: { x: 0, y: 0 } })),
  ];
  const connections = power
    ? Array.from({ length: n }, (_, i) => ({ from: `g${i}`, to: "pwr", kind: "power" as const }))
    : [];
  return { components, connections };
}

describe("evaluateAgainstWorkload", () => {
  it("passes an inference workload when throughput meets the target", () => {
    const build = rig(2); // 2 * 3000 = 6000 QPS, powered + cooled
    const wl: Workload = { type: "inference", modality: "text", model: "ChatGPT-ish", qpsTarget: 5000 };
    const r = evaluateAgainstWorkload(build, wl);
    expect(r.passed).toBe(true);
    expect(r.bottleneck).toBeNull();
    expect(r.score).toBeGreaterThanOrEqual(60);
  });

  it("fails inference on compute when throughput is short", () => {
    const build = rig(1); // 3000 QPS
    const wl: Workload = { type: "inference", modality: "text", model: "x", qpsTarget: 5000 };
    const r = evaluateAgainstWorkload(build, wl);
    expect(r.passed).toBe(false);
    expect(r.bottleneck).toBe("compute");
    expect(r.score).toBeLessThan(50);
  });

  it("fails inference on affordability when too expensive per unit", () => {
    const build = rig(2);
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
    const build = rig(4); // no switch → not clustered
    const wl: Workload = { type: "training", modality: "text", modelSizeB: 70, targetThroughput: 3000 };
    const r = evaluateAgainstWorkload(build, wl);
    expect(r.passed).toBe(false);
    expect(r.bottleneck).toBe("network");
  });

  it("fails training on budget when over the GPU budget", () => {
    const build = rig(4, { extra: ["net-spine-switch"] }); // clustered, but 4 > budget of 2
    const wl: Workload = { type: "training", modality: "text", modelSizeB: 70, gpuBudget: 2 };
    const r = evaluateAgainstWorkload(build, wl);
    expect(r.passed).toBe(false);
    expect(r.bottleneck).toBe("budget");
  });

  it("prioritizes hard errors (power) over capacity shortfalls", () => {
    // Many GPUs on a tiny UPS → power-deficit error dominates over anything else
    const build = rig(100, { power: "power-ups" }); // 100 * 0.7kW + cooling >> 50kW supply
    const wl: Workload = { type: "inference", modality: "text", model: "x", qpsTarget: 1 };
    const r = evaluateAgainstWorkload(build, wl);
    expect(r.passed).toBe(false);
    expect(r.bottleneck).toBe("power");
  });
});
