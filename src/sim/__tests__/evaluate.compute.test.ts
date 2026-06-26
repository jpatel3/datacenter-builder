import { describe, it, expect } from "vitest";
import { computeCompute, computeNetwork } from "../evaluate";
import { catalog } from "../catalog";
import type { Build } from "../types";

function build(typeIds: string[]): Build {
  return {
    components: typeIds.map((typeId, i) => ({ instanceId: `i${i}`, typeId, position: { x: 0, y: 0 } })),
    connections: [],
  };
}

describe("computeCompute", () => {
  it("training collapses without interconnect; inference does not (the centerpiece lesson)", () => {
    const fourGpus = build(Array(4).fill("gpu-nvidia-h100"));
    const fourGpusNetworked = build([...Array(4).fill("gpu-nvidia-h100"), "net-spine-switch"]);

    const netA = computeNetwork(fourGpus, catalog);
    const netB = computeNetwork(fourGpusNetworked, catalog);

    const a = computeCompute(fourGpus, catalog, "text", netA);
    const b = computeCompute(fourGpusNetworked, catalog, "text", netB);

    // Inference is ~equal (embarrassingly parallel)
    expect(a.inferenceThroughput).toBeCloseTo(b.inferenceThroughput, 5);
    // Training diverges sharply (unconnected is penalized)
    expect(b.trainingThroughput).toBeGreaterThan(a.trainingThroughput * 2);
  });

  it("image modality serves far fewer outputs than text", () => {
    const b = build(Array(4).fill("gpu-nvidia-h100"));
    const net = computeNetwork(b, catalog);
    const text = computeCompute(b, catalog, "text", net);
    const image = computeCompute(b, catalog, "image", net);
    expect(image.modality).toBe("image");
    expect(image.inferenceThroughput).toBeLessThan(text.inferenceThroughput / 10);
  });

  it("applies chip specialization multipliers (Inferentia trains poorly)", () => {
    const inferentia = build(["acc-aws-inferentia"]); // trainEff 0.3
    const trainium = build(["acc-aws-trainium"]); // trainEff 1.0
    const netI = computeNetwork(inferentia, catalog);
    const netT = computeNetwork(trainium, catalog);
    const i = computeCompute(inferentia, catalog, "text", netI);
    const t = computeCompute(trainium, catalog, "text", netT);
    // Trainium (650 * 1.0) trains far better than Inferentia (100 * 0.3)
    expect(t.trainingThroughput).toBeGreaterThan(i.trainingThroughput * 5);
  });
});
