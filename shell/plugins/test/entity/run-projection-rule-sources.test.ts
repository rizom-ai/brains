import { describe, expect, it } from "bun:test";
import { z } from "@brains/utils/zod";
import { createPluginHarness } from "../../src/test/harness";
import { defineProjectionRule } from "../../src";
import type { ProjectionWaveInput } from "../../src";

/**
 * What an eval is measuring, when the rule only looks at what changed.
 *
 * A rule that reads the corpus needs no trigger — the corpus is there. A rule
 * woken by a conversation reads only the conversations it was woken about, so
 * with no sources named it selects nothing and abstains, and the eval
 * measures an empty run rather than the derivation it was written for.
 */
describe("running a projection rule from an eval", () => {
  const rule = defineProjectionRule({
    id: "summary-derivation",
    version: "1",
    sources: [{ kind: "conversation" }],
    targetType: "summary",
    targets: { authority: "additive" },
    inputSchema: z.object({ sourceIds: z.array(z.string()) }),
    selectInput: async (trigger) => ({
      sourceIds: trigger.inputs.map(({ sourceId }) => sourceId),
    }),
    derive: async (input) =>
      input.sourceIds.map((sourceId) => ({
        operation: "upsert" as const,
        entity: {
          id: sourceId,
          entityType: "summary",
          content: `# ${sourceId}`,
          metadata: {},
          visibility: "shared" as const,
        },
      })),
  });

  it("names the sources it is simulating", async () => {
    const harness = createPluginHarness();
    const inputs: ProjectionWaveInput[] = [
      {
        sourceType: "conversation",
        sourceId: "conversation-1",
        revision: "rev-1",
        operation: "upsert",
      },
    ];

    const intents = await harness
      .getMockShell()
      .runProjectionRule(rule, { inputs });

    expect(intents).toEqual([
      {
        operation: "upsert",
        entity: {
          id: "conversation-1",
          entityType: "summary",
          content: "# conversation-1",
          metadata: {},
          visibility: "shared",
        },
      },
    ]);

    harness.reset();
  });

  it("still measures against the corpus when no sources are named", async () => {
    const harness = createPluginHarness();

    expect(await harness.getMockShell().runProjectionRule(rule)).toEqual([]);

    harness.reset();
  });
});
