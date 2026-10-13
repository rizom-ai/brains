import { beforeEach, describe, expect, it } from "bun:test";
import { randomUUID } from "node:crypto";
import {
  CONVERSATION_GUEST_MESSAGE_ADDED_CHANNEL,
  CONVERSATION_MESSAGE_ADDED_CHANNEL,
} from "@brains/plugins";
import { GUEST_ASKED_BEFORE_CHANNEL } from "@brains/contracts";
import { createPluginHarness } from "@brains/plugins/test";
import { FaqPlugin } from "../src";

describe("FaqPlugin", () => {
  let harness: ReturnType<typeof createPluginHarness>;

  beforeEach(async () => {
    harness = createPluginHarness({
      dataDir: `/tmp/test-faq-plugin-${randomUUID()}`,
    });
    await harness.installPlugin(new FaqPlugin());
  });

  async function addMessage(
    role: "user" | "assistant",
    metadata?: Record<string, unknown>,
  ): Promise<void> {
    await harness.sendMessage(CONVERSATION_MESSAGE_ADDED_CHANNEL, {
      conversationId: "conv-1",
      messageId: "m2",
      role,
      content: "text",
      ...(metadata ? { metadata } : {}),
      timestamp: new Date().toISOString(),
    });
  }

  async function queuedCaptures(): Promise<unknown[]> {
    const jobs = await harness
      .getMockShell()
      .getJobQueueService()
      .getActiveJobs();
    return jobs
      .filter((job) => job.type.endsWith("faq-capture"))
      .map((job) => JSON.parse(job.data));
  }

  it("answers the shell's asked-before question, with nothing when no FAQ asks it", async () => {
    const response = await harness.sendMessage(GUEST_ASKED_BEFORE_CHANNEL, {
      question: "How does Rizom keep memory?",
    });
    expect(response).toEqual({});
    // A question that is not one is no answer either, never an error.
    const blank: unknown = await harness.sendMessage(
      GUEST_ASKED_BEFORE_CHANNEL,
      { question: "" },
    );
    expect(blank).toEqual({});
  });

  it("leaves the shell's asked-before question unanswered while FAQs are off", async () => {
    const off = createPluginHarness({
      dataDir: `/tmp/test-faq-plugin-off-${randomUUID()}`,
    });
    await off.installPlugin(new FaqPlugin({ enabled: false }));
    const response: unknown = await off.sendMessage(
      GUEST_ASKED_BEFORE_CHANNEL,
      { question: "How does Rizom keep memory?" },
    );
    expect(response).toBeUndefined();
  });

  it("registers the faq entity type without tools", () => {
    expect(harness.getEntityService().getEntityTypes()).toContain("faq");
    expect(harness.getCapabilities().tools).toHaveLength(0);
  });

  it("queues a capture for an assistant reply with its permission level and position", async () => {
    const shell = harness.getMockShell();
    const conversations = shell.getConversationService();
    shell.getConversationService = (): typeof conversations => ({
      ...conversations,
      countMessages: async (): Promise<number> => 7,
    });
    await addMessage("assistant", { userPermissionLevel: "trusted" });

    expect(await queuedCaptures()).toEqual([
      {
        conversationId: "conv-1",
        messageId: "m2",
        userPermissionLevel: "trusted",
        position: 7,
      },
    ]);
  });

  it("ignores user messages", async () => {
    await addMessage("user", { userPermissionLevel: "admin" });

    expect(await queuedCaptures()).toEqual([]);
  });

  it("ignores replies without a recorded permission level", async () => {
    await addMessage("assistant");

    expect(await queuedCaptures()).toEqual([]);
  });

  // Visitors ask the questions a public FAQ answers. Their replies become
  // public drafts the owner reviews; their own messages are never captured.
  it("queues a public capture for a reply to a site visitor", async () => {
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

    expect(await queuedCaptures()).toEqual([
      {
        conversationId: "guest-1",
        messageId: "g2",
        userPermissionLevel: "public",
        position: 4,
      },
    ]);
  });
});

describe("FaqPlugin site surface", () => {
  it("keeps FAQs out of broad searches, so answers never cite them as sources", async () => {
    const harness = createPluginHarness({
      dataDir: `/tmp/test-faq-plugin-${randomUUID()}`,
    });
    await harness.installPlugin(new FaqPlugin());

    expect(
      harness.getEntityRegistry().getEntityTypeConfig("faq"),
    ).toMatchObject({ includeInBroadSearch: false });
  });

  it("makes publishing a FAQ a publish action", async () => {
    const harness = createPluginHarness({
      dataDir: `/tmp/test-faq-plugin-${randomUUID()}`,
    });
    await harness.installPlugin(new FaqPlugin());

    expect(
      harness.getEntityRegistry().getEntityTypeConfig("faq").publish,
    ).toEqual({ publishStatuses: ["published"] });
  });

  it("offers a section for sites to place, without an automatic route", async () => {
    const harness = createPluginHarness({
      dataDir: `/tmp/test-faq-plugin-${randomUUID()}`,
    });
    await harness.installPlugin(new FaqPlugin());

    const templates = [...harness.getTemplates().keys()];
    expect(templates.some((name) => name.endsWith("faq-section"))).toBe(true);
    expect(templates.some((name) => name.endsWith("faq-list"))).toBe(false);
    expect([...harness.getDataSources().keys()]).toContain("faq:entities");
  });
});

describe("FaqPlugin disabled", () => {
  it("queues nothing when capture is disabled", async () => {
    const harness = createPluginHarness({
      dataDir: `/tmp/test-faq-plugin-${randomUUID()}`,
    });
    await harness.installPlugin(new FaqPlugin({ enabled: false }));

    await harness.sendMessage(CONVERSATION_MESSAGE_ADDED_CHANNEL, {
      conversationId: "conv-1",
      messageId: "m2",
      role: "assistant",
      content: "text",
      metadata: { userPermissionLevel: "admin" },
      timestamp: new Date().toISOString(),
    });

    const jobs = await harness
      .getMockShell()
      .getJobQueueService()
      .getActiveJobs();
    expect(jobs.filter((job) => job.type.endsWith("faq-capture"))).toEqual([]);
  });

  it("queues nothing for a site visitor's reply when capture is disabled", async () => {
    const harness = createPluginHarness({
      dataDir: `/tmp/test-faq-plugin-${randomUUID()}`,
    });
    await harness.installPlugin(new FaqPlugin({ enabled: false }));

    await harness.sendMessage(CONVERSATION_GUEST_MESSAGE_ADDED_CHANNEL, {
      conversationId: "guest-1",
      messageId: "g2",
      role: "assistant",
      position: 4,
    });

    const jobs = await harness
      .getMockShell()
      .getJobQueueService()
      .getActiveJobs();
    expect(jobs.filter((job) => job.type.endsWith("faq-capture"))).toEqual([]);
  });
});

describe("FaqPlugin reconciliation", () => {
  it("queues a reconcile when a FAQ's embedding is ready, and only then", async () => {
    const harness = createPluginHarness({
      dataDir: `/tmp/test-faq-plugin-${randomUUID()}`,
    });
    await harness.installPlugin(new FaqPlugin());

    await harness.sendMessage("entity:embedding:ready", {
      entityType: "note",
      entityId: "note-1",
    });
    await harness.sendMessage("entity:embedding:ready", {
      entityType: "faq",
      entityId: "faq-1",
    });

    const jobs = await harness
      .getMockShell()
      .getJobQueueService()
      .getActiveJobs();
    expect(
      jobs
        .filter((job) => job.type.endsWith("faq-reconcile"))
        .map((job) => JSON.parse(job.data)),
    ).toEqual([{ entityId: "faq-1" }]);
  });
});

describe("FaqPlugin evals", () => {
  it("registers the classifyExchange and sameQuestion eval handlers", async () => {
    const harness = createPluginHarness({
      dataDir: `/tmp/test-faq-plugin-${randomUUID()}`,
    });
    const registrations: string[] = [];
    harness.getMockShell().registerEvalHandler = (
      pluginId,
      handlerId,
    ): void => {
      registrations.push(`${pluginId}:${handlerId}`);
    };

    await harness.installPlugin(new FaqPlugin());

    expect(registrations.sort()).toEqual([
      "faq:classifyExchange",
      "faq:sameQuestion",
    ]);
  });
});
