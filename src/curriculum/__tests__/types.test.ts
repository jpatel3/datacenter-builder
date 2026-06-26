import { describe, it, expect } from "vitest";
import type { Course } from "../types";

describe("curriculum types", () => {
  it("a Course is plain serializable data", () => {
    const c: Course = {
      id: "c1",
      title: "T",
      modules: [
        {
          id: "m1",
          title: "M",
          lessons: [{ id: "l1", title: "L", blocks: [{ id: "b1", type: "teach", title: "Hi", body: "Body" }] }],
        },
      ],
    };
    expect(JSON.parse(JSON.stringify(c))).toEqual(c);
  });
});
