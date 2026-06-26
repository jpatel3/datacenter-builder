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
