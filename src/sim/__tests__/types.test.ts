import { describe, it, expect } from "vitest";
import type { Build } from "../types";

describe("types", () => {
  it("a Build is plain serializable data (round-trips through JSON)", () => {
    const build: Build = {
      components: [
        { instanceId: "a1", typeId: "gpu-nvidia-h100", position: { x: 0, y: 0 } },
      ],
      connections: [],
    };
    const roundTripped = JSON.parse(JSON.stringify(build)) as Build;
    expect(roundTripped).toEqual(build);
  });
});
