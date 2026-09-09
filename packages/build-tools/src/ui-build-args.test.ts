import { describe, expect, it } from "bun:test";
import { parseUiBuildArgs } from "./ui-build-args";

describe("UI build arguments", () => {
  it("keeps default output optional and accepts an explicit destination", () => {
    expect(parseUiBuildArgs([])).toEqual({});
    expect(parseUiBuildArgs(["--outdir", "/tmp/private UI"])).toEqual({
      outdir: "/tmp/private UI",
    });
    expect(parseUiBuildArgs(["--outdir=/tmp/private-ui"])).toEqual({
      outdir: "/tmp/private-ui",
    });
  });
  it("rejects missing values, unknown flags, and unexpected positionals", () => {
    expect(() => parseUiBuildArgs(["--outdir"])).toThrow();
    expect(() => parseUiBuildArgs(["--output", "/tmp/private-ui"])).toThrow();
    expect(() => parseUiBuildArgs(["/tmp/private-ui"])).toThrow();
  });
});
