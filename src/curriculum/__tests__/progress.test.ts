import { describe, it, expect } from "vitest";
import {
  flattenBlocks,
  currentBlock,
  unlockedComponents,
  completeBlock,
  courseProgressPct,
  locateBlock,
} from "../progress";
import type { Course, Progress } from "../types";

const course: Course = {
  id: "c",
  title: "C",
  modules: [
    {
      id: "m1",
      title: "M1",
      lessons: [
        {
          id: "l1",
          title: "L1",
          blocks: [
            { id: "b1", type: "teach", title: "t", body: "b", unlocks: ["gpu-nvidia-a100"] },
            {
              id: "b2",
              type: "task",
              title: "t",
              body: "b",
              unlocks: ["power-grid-feed"],
              successCheck: { require: "componentCount", category: "accelerator", min: 1 },
            },
            { id: "b3", type: "teach", title: "t", body: "b", unlocks: ["rack-42u"] },
          ],
        },
      ],
    },
  ],
};

describe("progress", () => {
  it("flattens blocks in order", () => {
    expect(flattenBlocks(course).map((b) => b.id)).toEqual(["b1", "b2", "b3"]);
  });

  it("current block is the first incomplete one", () => {
    expect(currentBlock(course, { completedBlockIds: [] })!.id).toBe("b1");
    expect(currentBlock(course, { completedBlockIds: ["b1"] })!.id).toBe("b2");
    expect(currentBlock(course, { completedBlockIds: ["b1", "b2", "b3"] })).toBeNull();
  });

  it("unlocks accumulate up to and including the current block", () => {
    expect(unlockedComponents(course, { completedBlockIds: [] })).toEqual(new Set(["gpu-nvidia-a100"]));
    expect(unlockedComponents(course, { completedBlockIds: ["b1"] })).toEqual(
      new Set(["gpu-nvidia-a100", "power-grid-feed"]),
    );
  });

  it("completeBlock is idempotent and append-only", () => {
    const p: Progress = { completedBlockIds: ["b1"] };
    expect(completeBlock(p, "b2").completedBlockIds).toEqual(["b1", "b2"]);
    expect(completeBlock(p, "b1").completedBlockIds).toEqual(["b1"]);
  });

  it("progress percent reflects completed fraction", () => {
    expect(courseProgressPct(course, { completedBlockIds: [] })).toBe(0);
    expect(courseProgressPct(course, { completedBlockIds: ["b1", "b2", "b3"] })).toBe(100);
  });

  it("locateBlock returns module/lesson titles, step index, and count", () => {
    const pos = locateBlock(course, "b2")!;
    expect(pos.moduleTitle).toBe("M1");
    expect(pos.lessonTitle).toBe("L1");
    expect(pos.stepIndex).toBe(1);
    expect(pos.stepCount).toBe(3);
  });

  it("locateBlock returns null for an unknown id", () => {
    expect(locateBlock(course, "nope")).toBeNull();
  });
});
