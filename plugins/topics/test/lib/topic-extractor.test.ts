import { describe, it, expect, beforeEach } from "bun:test";
import { TopicExtractor } from "../../src/lib/topic-extractor";
import {
  MockShell,
  createServicePluginContext,
  createSilentLogger,
  type ServicePluginContext,
  type Logger,
} from "@brains/plugins/test";

describe("TopicExtractor", () => {
  let extractor: TopicExtractor;
  let context: ServicePluginContext;
  let logger: Logger;
  let mockShell: MockShell;

  beforeEach(() => {
    logger = createSilentLogger();
    mockShell = MockShell.createFresh({ logger });
    context = createServicePluginContext(mockShell, "topics");
    extractor = new TopicExtractor(context, logger);
  });

  it("should be instantiable", () => {
    expect(extractor).toBeDefined();
  });

  it("should extract topics from conversation window", async () => {
    const result = await extractor.extractFromConversationWindow(
      "test-conversation",
      0,
      10,
      0.5,
    );
    expect(result).toBeDefined();
    expect(Array.isArray(result)).toBe(true);
  });

  it("should handle invalid conversation ID gracefully", async () => {
    const result = await extractor.extractFromConversationWindow(
      "non-existent",
      0,
      10,
      0.5,
    );
    expect(result).toBeDefined();
    expect(Array.isArray(result)).toBe(true);
  });
});
