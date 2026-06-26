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
