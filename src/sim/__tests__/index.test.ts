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
