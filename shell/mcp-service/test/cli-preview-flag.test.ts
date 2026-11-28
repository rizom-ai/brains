import { describe, expect, it } from "bun:test";
import { resolvePreviewFlag } from "../src/schema-map";

describe("resolvePreviewFlag", () => {
  it("asks a tool with an environment for its preview", () => {
    expect(
      resolvePreviewFlag("build", ["environment"], {
        preview: true,
        remote: "rover.rizom.ai",
      }),
    ).toEqual({ flags: { environment: "preview", remote: "rover.rizom.ai" } });
  });

  it("rejects the flag for a tool without an environment", () => {
    const result = resolvePreviewFlag("status", [], { preview: true });

    expect(result).toEqual({
      error:
        "Unknown flag --preview for `brain status`: it has no environment to preview. Run `brain status --help` for the flags it accepts.",
    });
  });

  it("leaves flags without --preview as they are", () => {
    expect(resolvePreviewFlag("status", [], { token: "t" })).toEqual({
      flags: { token: "t" },
    });
  });
});
