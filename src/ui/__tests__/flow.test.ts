import { describe, it, expect } from "vitest";
import { buildFlowModel } from "../flow";
import { evaluateBuild } from "../../sim";
import type { Build } from "../../sim";

function build(typeIds: string[], connections: Build["connections"] = []): Build {
  return {
    components: typeIds.map((typeId, i) => ({ instanceId: `i${i}`, typeId, position: { x: 0, y: 0 } })),
    connections,
  };
}

describe("buildFlowModel", () => {
  it("includes a node per category present and the expected edges", () => {
    const b = build(
      ["gpu-nvidia-h100", "power-grid-feed", "cooling-crac", "net-spine-switch"],
      [{ from: "i0", to: "i1", kind: "power" }],
    );
    const m = buildFlowModel(b, evaluateBuild(b));
    const ids = m.nodes.map((n) => n.id).sort();
    expect(ids).toEqual(["compute", "cooling", "network", "power"]);
    const edge = (f: string, t: string) => m.edges.some((e) => e.from === f && e.to === t);
    expect(edge("power", "compute")).toBe(true);
    expect(edge("compute", "cooling")).toBe(true);
    expect(edge("network", "compute")).toBe(true);
  });

  it("flags power deficit on the power node", () => {
    const b = build(["cooling-liquid", "cooling-liquid", "cooling-liquid", "power-ups"]); // 60kW > 50kW
    const m = buildFlowModel(b, evaluateBuild(b));
    expect(m.nodes.find((n) => n.id === "power")!.status).toBe("alert");
  });

  it("flags overheating on the cooling node and the heat edge", () => {
    const b = build([...Array(100).fill("gpu-nvidia-h100"), "power-grid-feed", "cooling-crac"]);
    const m = buildFlowModel(b, evaluateBuild(b));
    expect(m.nodes.find((n) => n.id === "cooling")!.status).toBe("alert");
    expect(m.edges.find((e) => e.kind === "heat")!.status).toBe("alert");
  });

  it("flags an un-clustered multi-GPU build on the compute node", () => {
    const b = build(
      [...Array(4).fill("gpu-nvidia-h100"), "power-grid-feed", "cooling-liquid"],
      [{ from: "i0", to: "i4", kind: "power" }],
    );
    const m = buildFlowModel(b, evaluateBuild(b));
    expect(m.nodes.find((n) => n.id === "compute")!.status).toBe("alert");
    expect(m.nodes.find((n) => n.id === "compute")!.alert).toBe("not clustered");
  });

  it("is empty for an empty build", () => {
    const empty: Build = { components: [], connections: [] };
    expect(buildFlowModel(empty, evaluateBuild(empty)).nodes).toHaveLength(0);
  });
});
