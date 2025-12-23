import { describe, it, expect } from "bun:test";
import { TopicService } from "../../src/lib/topic-service";
import { createSilentLogger } from "@brains/test-utils";
import { MockShell, createServicePluginContext } from "@brains/plugins/test";

describe("TopicService", () => {
  it("should be instantiable", () => {
    const logger = createSilentLogger();
    const mockShell = MockShell.createFresh({ logger });
    const context = createServicePluginContext(mockShell, "topics");
    const service = new TopicService(context.entityService, logger);

    expect(service).toBeDefined();
  });

  it("should return null for non-existent topic", async () => {
    const logger = createSilentLogger();
    const mockShell = MockShell.createFresh({ logger });
    const context = createServicePluginContext(mockShell, "topics");
    const service = new TopicService(context.entityService, logger);

    const result = await service.getTopic("non-existent");
    expect(result).toBeNull();
  });

  it("should return empty array when no topics exist", async () => {
    const logger = createSilentLogger();
    const mockShell = MockShell.createFresh({ logger });
    const context = createServicePluginContext(mockShell, "topics");
    const service = new TopicService(context.entityService, logger);

    const result = await service.listTopics();
    expect(result).toEqual([]);
  });

  it("should return empty search results for empty query", async () => {
    const logger = createSilentLogger();
    const mockShell = MockShell.createFresh({ logger });
    const context = createServicePluginContext(mockShell, "topics");
    const service = new TopicService(context.entityService, logger);

    const result = await service.searchTopics("");
    expect(result).toEqual([]);
  });
});
