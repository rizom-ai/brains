import { describe, expect, it } from "bun:test";
import { DocumentPlugin } from "../src/plugin";

class TestDocumentPlugin extends DocumentPlugin {
  public instructions(): Promise<string> {
    return this.getInstructions();
  }
}

describe("document instructions", () => {
  it("routes PDF artifacts through the current tool arguments", async () => {
    const instructions = await new TestDocumentPlugin().instructions();

    expect(instructions).toContain("system_generate operation.kind attachment");
    expect(instructions).toContain("upload transform preserve");
    expect(instructions).not.toContain("source.kind attachment");
  });
});
