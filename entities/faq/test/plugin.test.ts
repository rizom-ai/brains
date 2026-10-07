import { beforeEach, afterEach, describe, expect, it, spyOn } from "bun:test";
import { instantiatePluginPackageDefinition } from "@brains/plugins";
import {
  type z,
  CONVERSATION_GUEST_MESSAGE_ADDED_CHANNEL,
  CONVERSATION_MESSAGE_ADDED_CHANNEL,
} from "@brains/sdk/services";
import { createPluginHarness } from "@brains/plugins/test";
import definition, { createFaqContent, faqMetadata, faqSchema } from "../src";
import { GUEST_ASKED_BEFORE_CHANNEL } from "@brains/contracts";
import type { FaqConfigInput } from "../src/schemas/config";

const metadata = { name: "@brains/faq", version: "0.0.0-test" };
async function install(
  harness: ReturnType<typeof createPluginHarness>,
  config: FaqConfigInput = {},
): Promise<void> {
  await harness.installPlugins(
    instantiatePluginPackageDefinition(definition, config, metadata),
  );
  await harness.finalizeRegistration();
}
async function queued(
  harness: ReturnType<typeof createPluginHarness>,
  type: "faq-capture" | "faq-reconcile",
): Promise<unknown[]> {
  return (await harness.getMockShell().getJobQueueService().getActiveJobs())
    .filter((job) => job.type === `@brains/faq:capture:${type}`)
    .map((job) => JSON.parse(job.data));
}

describe("canonical FAQ package", () => {
  let harness: ReturnType<typeof createPluginHarness>;
  beforeEach(async () => {
    harness = createPluginHarness();
    await install(harness);
  });
  afterEach(async () => {
    await harness.reset();
  });
  async function addMessage(
    role: "user" | "assistant",
    permission?: string,
  ): Promise<void> {
    await harness.sendMessage(CONVERSATION_MESSAGE_ADDED_CHANNEL, {
      conversationId: "conv-1",
      messageId: "m2",
      role,
      content: "text",
      position: 7,
      ...(permission && { metadata: { userPermissionLevel: permission } }),
      timestamp: new Date().toISOString(),
    });
  }
  it("registers the faq entity type without tools", () => {
    expect(harness.getEntityService().getEntityTypes()).toContain("faq");
    expect(harness.getCapabilities().tools).toHaveLength(0);
  });
  it("answers through the installed subscription without counting and rechecks eligibility after confirmation", async () => {
    const service = harness.getEntityService();
    const frontmatter = {
      question: "What is memory?",
      status: "published",
      asked: 3,
    } as const;
    await service.createEntity({
      entity: {
        id: "memory",
        entityType: "faq",
        visibility: "public",
        content: createFaqContent(frontmatter, "Kept words."),
        metadata: faqMetadata(frontmatter),
      },
    });
    service.searchWithDistances = async (): ReturnType<
      typeof service.searchWithDistances
    > => [{ entityType: "faq", entityId: "memory", distance: 0.01 }];
    let withdraw = false;
    harness.getMockShell().generateObject = async <T>(
      _prompt: string,
      schema: z.ZodType<T>,
    ): Promise<{ object: T }> => {
      if (withdraw) {
        const current = await service.getEntity(
          { entityType: "faq", id: "memory" },
          faqSchema,
        );
        if (!current) throw new Error("Missing FAQ");
        await service.updateEntity({
          entity: {
            ...current,
            metadata: { ...current.metadata, status: "draft" },
          },
        });
      }
      return { object: schema.parse({ same: true }) };
    };
    expect(
      await harness.sendMessage(GUEST_ASKED_BEFORE_CHANNEL, {
        question: "What is memory?",
      }),
    ).toMatchObject({
      hit: {
        faqId: "memory",
        faqQuestion: "What is memory?",
        answer: "Kept words.",
      },
    });
    expect(
      (await service.getEntity({ entityType: "faq", id: "memory" }, faqSchema))
        ?.metadata.asked,
    ).toBe(3);
    withdraw = true;
    const response: unknown = await harness.sendMessage(
      GUEST_ASKED_BEFORE_CHANNEL,
      { question: "What is memory?" },
    );
    expect(response).toEqual({});
  });
  it("queues an assistant reply with its recorded permission and committed position, never a later count", async () => {
    const count = spyOn(
      harness.getMockShell().getConversationService(),
      "countMessages",
    ).mockResolvedValue(100);
    await addMessage("assistant", "trusted");
    expect(await queued(harness, "faq-capture")).toEqual([
      {
        conversationId: "conv-1",
        messageId: "m2",
        userPermissionLevel: "trusted",
        position: 7,
      },
    ]);
    expect(count).not.toHaveBeenCalled();
  });
  it("ignores user messages", async () => {
    await addMessage("user", "admin");
    expect(await queued(harness, "faq-capture")).toEqual([]);
  });
  it("ignores replies without a valid recorded permission", async () => {
    await addMessage("assistant");
    await addMessage("assistant", "owner");
    expect(await queued(harness, "faq-capture")).toEqual([]);
  });
  it("ignores malformed or missing committed positions", async () => {
    for (const position of [undefined, 0, -1, 1.5])
      await harness.sendMessage(CONVERSATION_MESSAGE_ADDED_CHANNEL, {
        conversationId: "conv",
        messageId: "reply",
        role: "assistant",
        position,
        metadata: { userPermissionLevel: "admin" },
      });
    expect(await queued(harness, "faq-capture")).toEqual([]);
  });
  it("queues a public capture for a site visitor's reply, never the visitor's question", async () => {
    await harness.sendMessage(CONVERSATION_GUEST_MESSAGE_ADDED_CHANNEL, {
      conversationId: "guest-1",
      messageId: "g2",
      role: "assistant",
      position: 4,
    });
    await harness.sendMessage(CONVERSATION_GUEST_MESSAGE_ADDED_CHANNEL, {
      conversationId: "guest-1",
      messageId: "g1",
      role: "user",
      position: 3,
    });
    expect(await queued(harness, "faq-capture")).toEqual([
      {
        conversationId: "guest-1",
        messageId: "g2",
        userPermissionLevel: "public",
        position: 4,
      },
    ]);
  });
  it("queues reconciliation only after a FAQ embedding is ready", async () => {
    await harness.sendMessage("entity:embedding:ready", {
      entityType: "note",
      entityId: "note-1",
    });
    await harness.sendMessage("entity:embedding:ready", {
      entityType: "faq",
      entityId: "faq-1",
    });
    expect(await queued(harness, "faq-reconcile")).toEqual([
      { entityId: "faq-1" },
    ]);
  });
});

describe("FAQ package lifecycle", () => {
  for (const topic of [
    CONVERSATION_MESSAGE_ADDED_CHANNEL,
    CONVERSATION_GUEST_MESSAGE_ADDED_CHANNEL,
  ]) {
    it(`queues nothing for ${topic} when disabled`, async () => {
      const harness = createPluginHarness();
      try {
        await install(harness, { enabled: false });
        await harness.sendMessage(topic, {
          conversationId: "conv",
          messageId: "reply",
          role: "assistant",
          position: 2,
          metadata: { userPermissionLevel: "admin" },
        });
        await harness.sendMessage("entity:embedding:ready", {
          entityType: "faq",
          entityId: "faq-1",
        });
        expect(await queued(harness, "faq-capture")).toEqual([]);
        expect(await queued(harness, "faq-reconcile")).toEqual([]);
      } finally {
        await harness.reset();
      }
    });
  }
  it("registers both model evals under the installed declaration", async () => {
    const harness = createPluginHarness();
    const registrations: string[] = [];
    const model = spyOn(harness.getMockShell(), "generateObject");
    harness.getMockShell().registerEvalHandler = (
      pluginId,
      handlerId,
    ): void => {
      registrations.push(`${pluginId}:${handlerId}`);
    };
    try {
      await install(harness);
      expect(registrations.sort()).toEqual([
        "@brains/faq:capture:classifyExchange",
        "@brains/faq:capture:sameQuestion",
      ]);
      expect(model).not.toHaveBeenCalled();
    } finally {
      await harness.reset();
    }
  });
  it("hears embedding readiness in a worker while ordinary capture subscriptions remain interactive", async () => {
    const harness = createPluginHarness();
    const plugins = instantiatePluginPackageDefinition(
      definition,
      {},
      metadata,
    );
    try {
      for (const plugin of plugins)
        await plugin.register(harness.getMockShell(), { executionOnly: true });
      await harness.sendMessage("entity:embedding:ready", {
        entityType: "faq",
        entityId: "faq-1",
      });
      await harness.sendMessage(CONVERSATION_GUEST_MESSAGE_ADDED_CHANNEL, {
        conversationId: "guest",
        messageId: "reply",
        role: "assistant",
        position: 2,
      });
      expect(await queued(harness, "faq-reconcile")).toEqual([
        { entityId: "faq-1" },
      ]);
      expect(await queued(harness, "faq-capture")).toEqual([]);
    } finally {
      for (const plugin of [...plugins].reverse()) await plugin.shutdown?.();
      await harness.reset();
    }
  });
});
