import { describe, expect, it } from "bun:test";
import { image } from "../src";

describe("image instructions", () => {
  it("names the system_generate operations that make a new image", async () => {
    const instructions = image.instructions ?? "";

    expect(instructions).toContain("standalone-image or cover-image");
    expect(instructions).toContain(
      "never use it to describe, analyze, or discuss an existing uploaded image",
    );
    expect(instructions).toContain("prior-response");
  });

  // The generate schema has no prompt source or target fields: naming them
  // pointed the model at arguments the tool rejects.
  it("names no retired generate arguments", async () => {
    const instructions = image.instructions ?? "";

    expect(instructions).not.toContain("targetEntityType");
    expect(instructions).not.toContain("prompt source");
  });
});
