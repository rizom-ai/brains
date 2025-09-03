import { describe, it, expect, beforeEach, spyOn } from "bun:test";
import { createTopicsCommands } from "../../src/commands";
import {
  MockShell,
  createServicePluginContext,
  createSilentLogger,
  type ServicePluginContext,
  type Logger,
  type CommandContext,
} from "@brains/plugins";
import type { TopicsPluginConfig } from "../../src/schemas/config";
import { TopicService } from "../../src/lib/topic-service";

describe("Topics Commands", () => {
  let context: ServicePluginContext;
  let config: TopicsPluginConfig;
  let logger: Logger;
  let mockShell: MockShell;
  let mockCommandContext: CommandContext;

  beforeEach(() => {
    logger = createSilentLogger();
    mockShell = MockShell.createFresh({ logger });
    context = createServicePluginContext(mockShell, "topics");
    config = {
      windowSize: 30,
      minRelevanceScore: 0.7,
      mergeSimilarityThreshold: 0.8,
      autoMerge: true,
      enableAutoExtraction: true,
    };
    mockCommandContext = {
      messageId: "test-message-id",
      userId: "test-user",
      channelId: "test-channel",
      interfaceType: "cli",
      userPermissionLevel: "public",
    };
  });

  describe("createTopicsCommands", () => {
    it("should create commands array", () => {
      const commands = createTopicsCommands(context, config, logger);

      expect(commands).toBeDefined();
      expect(Array.isArray(commands)).toBe(true);
      expect(commands.length).toBeGreaterThan(0);
    });

    it("should create list command", () => {
      const commands = createTopicsCommands(context, config, logger);
      const listCommand = commands.find((cmd) => cmd.name === "topics-list");

      expect(listCommand).toBeDefined();
      expect(listCommand?.description).toBeDefined();
      expect(listCommand?.usage).toBeDefined();
    });

    it("should create get command", () => {
      const commands = createTopicsCommands(context, config, logger);
      const getCommand = commands.find((cmd) => cmd.name === "topics-get");

      expect(getCommand).toBeDefined();
      expect(getCommand?.description).toBeDefined();
      expect(getCommand?.usage).toBeDefined();
    });

    it("should create search command", () => {
      const commands = createTopicsCommands(context, config, logger);
      const searchCommand = commands.find(
        (cmd) => cmd.name === "topics-search",
      );

      expect(searchCommand).toBeDefined();
      expect(searchCommand?.description).toBeDefined();
      expect(searchCommand?.usage).toBeDefined();
    });

    it("list command should call TopicService.listTopics", async () => {
      const commands = createTopicsCommands(context, config, logger);
      const listCommand = commands.find((cmd) => cmd.name === "topics-list");
      const listTopicsSpy = spyOn(
        TopicService.prototype,
        "listTopics",
      ).mockResolvedValue([]);

      if (listCommand) {
        await listCommand.handler([], mockCommandContext);
        expect(listTopicsSpy).toHaveBeenCalled();
      }
    });
  });
});
