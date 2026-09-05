import { describe, expect, it } from "bun:test";
import { createPluginHarness } from "@brains/plugins/test";
import { installA2A } from "./helpers/install";

describe("A2A instructions", () => {
  it("tells the agent how to reach peers through the call tool", async () => {
    const harness = createPluginHarness();
    const { capabilities } = await installA2A(harness, { port: 0 });

    expect(capabilities.instructions).toBeString();
    expect(capabilities.instructions).toContain("a2a_call");
    expect(capabilities.instructions).toContain("agents_connect");
    await harness.reset();
  });
});
