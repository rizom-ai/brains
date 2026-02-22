import { describe, it, expect, beforeEach } from "bun:test";
import { TopicExtractor } from "../../src/lib/topic-extractor";
import { createSilentLogger } from "@brains/test-utils";
import {
  MockShell,
  createServicePluginContext,
  type ServicePluginContext,
  type Logger,
} from "@brains/plugins/test";
import { createMockBaseEntity } from "../fixtures/topic-entities";

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

  describe("extractFromEntity", () => {
    it("should extract topics from a blog post entity", async () => {
      const postEntity = createMockBaseEntity({
        id: "test-post",
        entityType: "post",
        content: `# Introduction to Machine Learning

Machine learning is a subset of artificial intelligence that enables
systems to learn from data. Deep learning uses neural networks with
multiple layers to process complex patterns.

## Key Concepts
- Supervised learning
- Unsupervised learning
- Reinforcement learning`,
        metadata: {
          title: "Introduction to Machine Learning",
          slug: "intro-to-ml",
        },
      });

      const result = await extractor.extractFromEntity(postEntity, 0.5);

      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
    });

    it("should set correct source metadata from entity", async () => {
      const linkEntity = createMockBaseEntity({
        id: "test-link-123",
        entityType: "link",
        content: "Article about TypeScript best practices and design patterns",
        metadata: {
          title: "TypeScript Best Practices",
          url: "https://example.com/ts-best-practices",
        },
      });

      const result = await extractor.extractFromEntity(linkEntity, 0.3);

      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
      const firstTopic = result[0];
      if (firstTopic && firstTopic.sources.length > 0) {
        const firstSource = firstTopic.sources[0];
        if (firstSource) {
          expect(firstSource.slug).toBe("test-link-123");
          expect(firstSource.type).toBe("link");
          expect(firstSource.title).toBe("TypeScript Best Practices");
        }
      }
    });

    it("should return empty array for empty content", async () => {
      const emptyEntity = createMockBaseEntity({
        id: "empty-entity",
        entityType: "post",
        content: "",
        metadata: { title: "Empty Post" },
      });

      const result = await extractor.extractFromEntity(emptyEntity, 0.5);

      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(0);
    });

    it("should filter topics by minimum relevance score", async () => {
      const entity = createMockBaseEntity({
        id: "test-entity",
        entityType: "summary",
        content: "Brief mention of various topics without depth",
        metadata: { title: "Brief Summary" },
      });

      const highThresholdResult = await extractor.extractFromEntity(
        entity,
        0.9,
      );
      const lowThresholdResult = await extractor.extractFromEntity(entity, 0.1);

      expect(highThresholdResult.length).toBeLessThanOrEqual(
        lowThresholdResult.length,
      );
    });
  });
});
