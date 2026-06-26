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
      [
        { from: "i0", to: "i2", kind: "power" },
        { from: "i1", to: "i2", kind: "power" },
      ],
    );
    const ok = checkSuccess({ require: "workloadPassed" }, b, {
      workload: { type: "inference", modality: "text", model: "x", qpsTarget: 5000 },
    });
    expect(ok).toBe(true);
  });

  it("all / any compose", () => {
    const b = build(["gpu-nvidia-a100", "rack-42u"]);
    expect(
      checkSuccess(
        {
          all: [
            { require: "componentCount", category: "accelerator", min: 1 },
            { require: "componentCount", category: "rack", min: 1 },
          ],
        },
        b,
      ),
    ).toBe(true);
    expect(
      checkSuccess(
        {
          any: [
            { require: "componentCount", category: "accelerator", min: 99 },
            { require: "componentCount", category: "rack", min: 1 },
          ],
        },
        b,
      ),
    ).toBe(true);
  });
});
