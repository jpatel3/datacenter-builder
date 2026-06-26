import { describe, it, expect } from "vitest";
import { course } from "../content";
import { flattenBlocks } from "../progress";
import { catalog } from "../../sim";

describe("course content", () => {
  const blocks = flattenBlocks(course);
  const catalogIds = new Set(catalog.map((c) => c.id));

  it("has Modules 1–6", () => {
    expect(course.modules.map((m) => m.id)).toEqual(["m1", "m2", "m3", "m4", "m5", "m6"]);
  });

  it("every unlocked component id exists in the catalog", () => {
    for (const b of blocks) {
      for (const u of b.unlocks ?? []) {
        expect(catalogIds, `${b.id} unlocks ${u}`).toContain(u);
      }
    }
  });

  it("every block id is unique", () => {
    const ids = blocks.map((b) => b.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("task/challenge blocks have a successCheck; reflect blocks have a quiz", () => {
    for (const b of blocks) {
      if (b.type === "task" || b.type === "challenge") expect(b.successCheck, b.id).toBeDefined();
      if (b.type === "reflect") expect(b.quiz, b.id).toBeDefined();
    }
  });

  it("challenge blocks that require workloadPassed declare a workload", () => {
    for (const b of blocks) {
      if (b.successCheck && "require" in b.successCheck && b.successCheck.require === "workloadPassed") {
        expect(b.workload, b.id).toBeDefined();
      }
    }
  });
});
