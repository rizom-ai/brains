import { describe, it, expect, beforeEach, spyOn } from "bun:test";
import type {
  Conversation,
  EntityChangePayload,
  Message,
} from "@brains/plugins";
import { SummaryPlugin } from "../src";
import {
  createPluginHarness,
  type PluginTestHarness,
} from "@brains/plugins/test";
import { createMockEntityPluginContext } from "@brains/test-utils";

const conversation: Conversation = {
  id: "conv-1",
  sessionId: "conv-1",
  interfaceType: "discord",
  channelId: "project-alpha",
  channelName: "project-alpha",
  startedAt: "2026-01-01T00:00:00.000Z",
  lastActiveAt: "2026-01-01T00:04:00.000Z",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:04:00.000Z",
  metadata: {},
};

describe("SummaryPlugin", () => {
  let harness: PluginTestHarness<SummaryPlugin>;
  let plugin: SummaryPlugin;

  beforeEach(() => {
    harness = createPluginHarness<SummaryPlugin>({
      dataDir: "/tmp/test-datadir",
    });
    plugin = new SummaryPlugin();
  });

  it("registers as an entity plugin", async () => {
    await harness.installPlugin(plugin);
    expect(plugin.id).toBe("summary");
    expect(plugin.type).toBe("entity");
    expect(harness.getEntityService().getEntityTypes()).toContain("summary");
  });

  it("initializes with projection config", async () => {
    await harness.installPlugin(plugin);
    const config = plugin.getConfig();

    expect(config.enableProjection).toBe(true);
    expect(config.maxSourceMessages).toBe(1000);
    expect(config.maxMessagesPerChunk).toBe(40);
    expect(config.minMessagesBetweenProjections).toBe(5);
    expect(config.maxEntries).toBe(50);
    expect(config.projectionVersion).toBe(1);
  });

  it("accepts custom config", async () => {
    const customPlugin = new SummaryPlugin({
      enableProjection: false,
      maxEntries: 10,
    });
    await harness.installPlugin(customPlugin);

    expect(customPlugin.getConfig().enableProjection).toBe(false);
    expect(customPlugin.getConfig().maxEntries).toBe(10);
  });

  it("uses projection throttling for conversation source changes", async () => {
    await harness.installPlugin(plugin);
    const context = harness.getEntityContext("summary");
    const messages: Message[] = Array.from({ length: 4 }, (_, index) => ({
      id: `m${index + 1}`,
      conversationId: "conv-1",
      role: "user",
      content: `Message ${index + 1}`,
      timestamp: new Date(Date.UTC(2026, 0, 1, 0, index)).toISOString(),
      metadata: {},
    }));

    spyOn(context.entityService, "getEntity").mockResolvedValue(null);
    spyOn(context.conversations, "getMessages").mockResolvedValue(messages);

    expect(
      await plugin["shouldEnqueueConversationProjection"](context, {
        conversationId: "conv-1",
      } as unknown as EntityChangePayload),
    ).toBe(false);
  });

  it("enqueues source changes for configured spaces after throttling", async () => {
    const context = createMockEntityPluginContext({
      spaces: ["discord:project-*"],
    });
    const messages: Message[] = Array.from({ length: 5 }, (_, index) => ({
      id: `m${index + 1}`,
      conversationId: "conv-1",
      role: "user",
      content: `Message ${index + 1}`,
      timestamp: new Date(Date.UTC(2026, 0, 1, 0, index)).toISOString(),
      metadata: {},
    }));

    spyOn(context.conversations, "get").mockResolvedValue(conversation);
    spyOn(context.conversations, "getMessages").mockResolvedValue(messages);
    spyOn(context.entityService, "getEntity").mockResolvedValue(null);

    expect(
      await plugin["shouldEnqueueConversationProjection"](context, {
        conversationId: "conv-1",
      } as unknown as EntityChangePayload),
    ).toBe(true);
  });

  it("does not enqueue source changes outside configured spaces", async () => {
    const context = createMockEntityPluginContext({ spaces: ["discord:ops"] });
    const messages: Message[] = Array.from({ length: 5 }, (_, index) => ({
      id: `m${index + 1}`,
      conversationId: "conv-1",
      role: "user",
      content: `Message ${index + 1}`,
      timestamp: new Date(Date.UTC(2026, 0, 1, 0, index)).toISOString(),
      metadata: {},
    }));

    spyOn(context.conversations, "get").mockResolvedValue(conversation);
    spyOn(context.conversations, "getMessages").mockResolvedValue(messages);

    expect(
      await plugin["shouldEnqueueConversationProjection"](context, {
        conversationId: "conv-1",
      } as unknown as EntityChangePayload),
    ).toBe(false);
  });

  it("registers no tools, plus templates and datasource", async () => {
    const capabilities = await harness.installPlugin(plugin);

    expect(capabilities.tools).toHaveLength(0);
    expect(
      Array.from(harness.getTemplates().keys()).some((name) =>
        name.includes("summary-list"),
      ),
    ).toBe(true);
    expect(
      Array.from(harness.getTemplates().keys()).some((name) =>
        name.includes("summary-detail"),
      ),
    ).toBe(true);
    expect(
      Array.from(harness.getDataSources().keys()).some((id) =>
        id.includes("summary"),
      ),
    ).toBe(true);
  });
});
