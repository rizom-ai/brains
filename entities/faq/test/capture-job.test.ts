import { expect, it } from "bun:test";
import { z } from "@brains/sdk/services";
import { createPluginHarness } from "@brains/plugins/test";
import { instantiatePluginPackageDefinition } from "@brains/plugins";
import { stubMethod } from "@brains/test-utils";
import definition from "../src";
import { faqSchema } from "../src/schemas/faq";

it("runs canonical FAQ capture with installed authority, preserved claims/receipts and a bounded transcript window", async () => {
  const harness = createPluginHarness();
  const shell = harness.getMockShell();
  const claimSchema = z.object({ claimedAt: z.string() });
  await shell
    .getRuntimeState()
    .scoped({ namespace: "faq.captured-replies", schema: claimSchema })
    .set("legacy", { claimedAt: "2020-01-01" });
  const windows: unknown[] = [];
  stubMethod(
    shell.getConversationService(),
    "getMessages",
    async (_id, options) => {
      windows.push(options);
      return [
        {
          id: "question",
          conversationId: "conversation",
          role: "user",
          content: "What do you offer?",
          timestamp: "2026-01-01",
          metadata: "{}",
        },
        {
          id: "reply",
          conversationId: "conversation",
          role: "assistant",
          content: "An example service.",
          timestamp: "2026-01-01",
          metadata: "{}",
        },
      ];
    },
  );
  let classifications = 0;
  shell.generateObject = async <T>(
    _prompt: string,
    schema: { parse(value: unknown): T },
  ): Promise<{ object: T }> => {
    classifications++;
    return {
      object: schema.parse({
        reusable: true,
        question: "What do you offer?",
        answer: "An example service.",
      }),
    };
  };
  try {
    await harness.installPlugins(
      instantiatePluginPackageDefinition(
        definition,
        {},
        { name: "@brains/faq", version: "0.0.0" },
      ),
    );
    await harness.finalizeRegistration();
    const type = "@brains/faq:capture:faq-capture";
    const data = {
      conversationId: "conversation",
      messageId: "legacy",
      userPermissionLevel: "public",
      position: 2,
    };
    expect(await harness.runJob(type, data)).toEqual({
      captured: false,
      reason: "already-captured",
    });
    expect(windows).toEqual([]);
    expect(classifications).toBe(0);
    expect(await harness.runJob(type, { ...data, messageId: "reply" })).toEqual(
      { captured: true, entityId: "what-do-you-offer", merged: false },
    );
    expect(windows).toEqual([{ range: { start: 1, end: 12 } }]);
    expect(classifications).toBe(1);
    const service = harness.getEntityService();
    expect(
      (
        await service.getEntity(
          { entityType: "faq", id: "what-do-you-offer" },
          faqSchema,
        )
      )?.visibility,
    ).toBe("public");
    expect(
      await service.getEntityMutationReceipt({
        namespace: "faq.capture",
        key: "reply",
      }),
    ).toEqual({
      operation: "create",
      entityType: "faq",
      entityId: "what-do-you-offer",
    });
    await service.deleteEntity({ entityType: "faq", id: "what-do-you-offer" });
    expect(await harness.runJob(type, { ...data, messageId: "reply" })).toEqual(
      { captured: false, reason: "already-captured" },
    );
    expect(classifications).toBe(1);
  } finally {
    await harness.reset();
  }
});
