import { describe, it, expect, beforeEach, afterEach, mock } from "bun:test";
import { createExtractTool } from "../../src/tools";
import {
  MockShell,
  createServicePluginContext,
  createSilentLogger,
  type ServicePluginContext,
  type Logger,
} from "@brains/plugins/test";
import type { TopicsPluginConfig } from "../../src/schemas/config";

describe("Topics Tools", () => {
  let context: ServicePluginContext;
  let config: TopicsPluginConfig;
  let logger: Logger;
  let mockShell: MockShell;

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
  });

  afterEach(() => {
    // Restore all mocked functions to prevent test pollution
    mock.restore();
  });

  describe("createExtractTool", () => {
    it("should create extract tool with correct metadata", () => {
      const tool = createExtractTool(context, config, logger);

      expect(tool.name).toBe("topics_extract");
      expect(tool.description).toContain("Extract topics from a conversation");
      expect(tool.inputSchema).toBeDefined();
    });
  });

  // Note: list/get/search tools removed - use system_list, system_get, system_search instead
});
