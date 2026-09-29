import { beforeEach, describe, expect, it } from "bun:test";
import { randomUUID } from "node:crypto";
import { CONVERSATION_MESSAGE_ADDED_CHANNEL } from "@brains/plugins";
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

  it("registers the faq entity type without tools", () => {
    expect(harness.getEntityService().getEntityTypes()).toContain("faq");
    expect(harness.getCapabilities().tools).toHaveLength(0);
  });

  it("queues a capture for an assistant reply with its permission level", async () => {
    await addMessage("assistant", { userPermissionLevel: "trusted" });

    expect(await queuedCaptures()).toEqual([
      {
        conversationId: "conv-1",
        messageId: "m2",
        userPermissionLevel: "trusted",
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
});

describe("FaqPlugin site surface", () => {
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
