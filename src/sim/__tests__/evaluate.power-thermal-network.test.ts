import { describe, it, expect } from "vitest";
import { computePower, computeThermal, computeNetwork } from "../evaluate";
import { catalog } from "../catalog";
import type { Build, Connection } from "../types";

function build(components: { typeId: string; id: string }[], connections: Connection[] = []): Build {
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
      { id: "p1", typeId: "power-ups" }, // 50 kW supply
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
