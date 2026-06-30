import { describe, it, expect } from "vitest";
import { parseShareParam, buildShareUrl } from "../share";

describe("parseShareParam", () => {
  it("extracts a uuid-like build id", () => {
    expect(parseShareParam("?build=2f1c8e7a-1234-4abc-9def-0123456789ab")).toBe("2f1c8e7a-1234-4abc-9def-0123456789ab");
  });
  it("returns null when absent", () => {
    expect(parseShareParam("?x=1")).toBeNull();
    expect(parseShareParam("")).toBeNull();
  });
  it("rejects garbage / too-short ids", () => {
    expect(parseShareParam("?build=nope")).toBeNull();
    expect(parseShareParam("?build=<script>")).toBeNull();
  });
});

describe("buildShareUrl", () => {
  it("joins origin + base path + id (base with trailing slash)", () => {
    expect(buildShareUrl("https://x.github.io", "/datacenter-builder/", "abc-123-456-7890-defghijklmno")).toBe(
      "https://x.github.io/datacenter-builder/?build=abc-123-456-7890-defghijklmno",
    );
  });
  it("adds a trailing slash to the base when missing", () => {
    expect(buildShareUrl("http://localhost:5174", "/", "id")).toBe("http://localhost:5174/?build=id");
  });
});
