import { describe, expect, it } from "bun:test";
import { documentEntity } from "../src";

describe("document instructions", () => {
  it("routes PDF artifacts through the current tool arguments", async () => {
    const instructions = documentEntity().instructions ?? "";

    expect(instructions).toContain("system_generate operation.kind attachment");
    expect(instructions).toContain("upload transform preserve");
    expect(instructions).not.toContain("source.kind attachment");
  });
});
