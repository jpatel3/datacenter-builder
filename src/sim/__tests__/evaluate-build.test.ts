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
