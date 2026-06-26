import { describe, it, expect } from "vitest";
import { catalog, LAST_UPDATED, PRICING_DISCLAIMER } from "../catalog";

describe("catalog", () => {
  it("has a dated pricing disclaimer", () => {
    expect(LAST_UPDATED).toMatch(/^\d{4}-\d{2}$/);
    expect(PRICING_DISCLAIMER.toLowerCase()).toContain("approximate");
  });

  it("every `requires` reference resolves to a real component id", () => {
    const ids = new Set(catalog.map((c) => c.id));
    for (const c of catalog) {
      for (const req of c.requires ?? []) {
        expect(ids, `${c.id} requires ${req}`).toContain(req);
      }
    }
  });

  it("has no negative capex, powerDraw, or heatOutput", () => {
    for (const c of catalog) {
      expect(c.capex, c.id).toBeGreaterThanOrEqual(0);
      expect(c.powerDraw, c.id).toBeGreaterThanOrEqual(0);
      expect(c.heatOutput, c.id).toBeGreaterThanOrEqual(0);
    }
  });

  it("covers the required accelerator vendors", () => {
    const vendors = new Set(
      catalog.filter((c) => c.category === "accelerator").map((c) => c.vendor),
    );
    for (const v of ["NVIDIA", "AMD", "AWS", "Google"]) {
      expect(vendors).toContain(v);
    }
  });

  it("every component has a description and an https learn-more link", () => {
    for (const c of catalog) {
      expect(c.description, c.id).toBeTruthy();
      expect(c.learnMoreUrl ?? "", c.id).toMatch(/^https:\/\//);
    }
  });

  it("models chip specialization sweet spots", () => {
    const trainium = catalog.find((c) => c.id === "acc-aws-trainium")!;
    const inferentia = catalog.find((c) => c.id === "acc-aws-inferentia")!;
    expect(Number(trainium.specs.trainEff)).toBeGreaterThan(Number(trainium.specs.inferEff));
    expect(Number(inferentia.specs.inferEff)).toBeGreaterThan(Number(inferentia.specs.trainEff));
  });
});
