import { describe, it, expect } from "bun:test";
import type { TopicMetadata } from "../../src/schemas/topic";
import { TopicService } from "../../src/lib/topic-service";
import { createSilentLogger } from "@brains/test-utils";
import {
  createMockShell,
  createEntityPluginContext,
} from "@brains/plugins/test";

describe("TopicService", () => {
  it("should be instantiable", () => {
    const logger = createSilentLogger();
    const mockShell = createMockShell({ logger });
    const context = createEntityPluginContext(mockShell, "topics");
    const service = new TopicService(context.entityService, logger);

    expect(service).toBeDefined();
  });

  it("should return null for non-existent topic", async () => {
    const logger = createSilentLogger();
    const mockShell = createMockShell({ logger });
    const context = createEntityPluginContext(mockShell, "topics");
    const service = new TopicService(context.entityService, logger);

    const result = await service.getTopic("non-existent");
    expect(result).toBeNull();
  });

  it("should return empty array when no topics exist", async () => {
    const logger = createSilentLogger();
    const mockShell = createMockShell({ logger });
    const context = createEntityPluginContext(mockShell, "topics");
    const service = new TopicService(context.entityService, logger);

    const result = await service.listTopics();
    expect(result).toEqual([]);
  });

  it("should return empty search results for empty query", async () => {
    const logger = createSilentLogger();
    const mockShell = createMockShell({ logger });
    const context = createEntityPluginContext(mockShell, "topics");
    const service = new TopicService(context.entityService, logger);

    const result = await service.searchTopics("");
    expect(result).toEqual([]);
  });

  it("should merge aliases with dedupe and canonical exclusion", () => {
    const logger = createSilentLogger();
    const mockShell = createMockShell({ logger });
    const context = createEntityPluginContext(mockShell, "topics");
    const service = new TopicService(context.entityService, logger);

    const aliases = service.mergeAliases(
      ["AI Collaboration"],
      "Human-AI Collaboration",
      [
        "Human-Agent Collaboration",
        "human-agent collaboration",
        "Human-AI Collaboration",
      ],
    );

    expect(aliases).toEqual(["AI Collaboration", "Human-Agent Collaboration"]);
  });

  it("defaults created topic metadata aliases to empty array", async () => {
    const logger = createSilentLogger();
    const mockShell = createMockShell({ logger });
    const context = createEntityPluginContext(mockShell, "topics");
    const service = new TopicService(context.entityService, logger);

    const created = await service.createTopic({
      title: "Test Topic",
      content: "Topic content",
      keywords: ["test"],
    });

    expect(created?.metadata).toEqual({ aliases: [] } satisfies TopicMetadata);
  });
});
