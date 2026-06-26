import { describe, expect, it, mock } from "bun:test";
import { z } from "@brains/utils/zod-v4";
import { createBasePluginContext } from "../../src/base/context";
import { createMockShell } from "../../src/test/mock-shell";
import { createSilentLogger } from "@brains/test-utils";

describe("plugin context judge capability", () => {
  it("exposes a narrow judge capability backed by the shell judge", async () => {
    const shell = createMockShell({ logger: createSilentLogger() });
    const judge = mock(async () => ({
      verdict: { met: true, reason: "The supplied material satisfies it." },
      usage: { promptTokens: 1, completionTokens: 2, totalTokens: 3 },
    }));
    Object.assign(shell, { judge });

    const context = createBasePluginContext(shell, "test-plugin");
    const schema = z.object({ met: z.boolean(), reason: z.string() });
    const result = await context.judge({
      instruction: "Decide whether this goal is met.",
      material: "Relevant material.",
      schema,
    });

    expect(result.verdict.met).toBe(true);
    expect(judge).toHaveBeenCalledWith({
      instruction: "Decide whether this goal is met.",
      material: "Relevant material.",
      schema,
    });
    expect("generateObject" in context).toBe(false);
  });
});
