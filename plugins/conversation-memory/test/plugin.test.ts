import { describe, it, expect, beforeEach, mock } from "bun:test";
import { ConversationMemoryPlugin } from "../src/plugin";
import { createServicePluginHarness } from "@brains/plugins";
import type { ConversationMemoryConfig } from "../src/types";

describe("ConversationMemoryPlugin", () => {
  let plugin: ConversationMemoryPlugin;
  let harness: ReturnType<typeof createServicePluginHarness>;

  beforeEach(() => {
    harness = createServicePluginHarness();
  });

  describe("initialization", () => {
    it("should initialize with default config", () => {
      plugin = new ConversationMemoryPlugin();

      expect(plugin.id).toBe("conversation-memory");
      expect(plugin.type).toBe("service");
    });

    it("should accept custom config", () => {
      const config: ConversationMemoryConfig = {
        databaseUrl: "file:./custom.db",
        summarization: {
          minMessages: 10,
          minTimeMinutes: 30,
          idleTimeMinutes: 15,
          enableAutomatic: false,
        },
      };

      plugin = new ConversationMemoryPlugin(config);

      expect(plugin.id).toBe("conversation-memory");
    });
  });

  describe("message handlers", () => {
    beforeEach(async () => {
      // Use in-memory database for testing
      plugin = new ConversationMemoryPlugin({
        databaseUrl: ":memory:",
      });
      await harness.installPlugin(plugin);
    });

    it("should register conversation message handlers", () => {
      const mockShell = harness.getShell();
      const subscriptions = mockShell.getMessageBus().getSubscriptions();

      expect(subscriptions).toContain("conversation:start");
      expect(subscriptions).toContain("conversation:addMessage");
      expect(subscriptions).toContain("conversation:getMessages");
      expect(subscriptions).toContain("conversation:checkSummarization");
    });

    it("should register conversation-topic entity type", () => {
      const mockShell = harness.getShell();
      const entityTypes = mockShell.getEntityService().getEntityTypes();

      expect(entityTypes).toContain("conversation-topic");
    });
  });

  describe("getTools", () => {
    it("should return conversation tools after registration", async () => {
      plugin = new ConversationMemoryPlugin({
        databaseUrl: ":memory:",
      });
      await harness.installPlugin(plugin);

      const tools = await plugin.getTools();

      expect(tools).toBeArray();
      expect(tools.length).toBe(3);

      const toolNames = tools.map((t) => t.name);
      expect(toolNames).toContain(
        "conversation-memory:get_conversation_history",
      );
      expect(toolNames).toContain("conversation-memory:search_conversations");
      expect(toolNames).toContain(
        "conversation-memory:get_conversation_context",
      );
    });

    it("should return empty array before registration", async () => {
      plugin = new ConversationMemoryPlugin();

      const tools = await plugin.getTools();

      expect(tools).toEqual([]);
    });
  });

  describe("shutdown", () => {
    it("should log shutdown message", async () => {
      plugin = new ConversationMemoryPlugin({
        databaseUrl: ":memory:",
      });
      await harness.installPlugin(plugin);

      const logSpy = mock(() => {});
      plugin.logger.info = logSpy;

      await plugin.shutdown();

      expect(logSpy).toHaveBeenCalledWith(
        "Conversation memory plugin shutdown",
      );
    });
  });
});
