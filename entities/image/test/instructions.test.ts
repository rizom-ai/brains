import { describe, expect, it } from "bun:test";
import { ImagePlugin } from "../src/image-plugin";

class TestImagePlugin extends ImagePlugin {
  public instructions(): Promise<string> {
    return this.getInstructions();
  }
}

describe("image instructions", () => {
  it("names the system_generate operations that make a new image", async () => {
    const instructions = await new TestImagePlugin().instructions();

    expect(instructions).toContain("standalone-image or cover-image");
    expect(instructions).toContain(
      "never use it to describe, analyze, or discuss an existing uploaded image",
    );
    expect(instructions).toContain("prior-response");
  });

  // The generate schema has no prompt source or target fields: naming them
  // pointed the model at arguments the tool rejects.
  it("names no retired generate arguments", async () => {
    const instructions = await new TestImagePlugin().instructions();

    expect(instructions).not.toContain("targetEntityType");
    expect(instructions).not.toContain("prompt source");
  });
});
