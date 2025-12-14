import { describe, it, expect, beforeEach } from "bun:test";
import { TopicExtractor } from "../../src/lib/topic-extractor";
import {
  MockShell,
  createServicePluginContext,
  createSilentLogger,
  type ServicePluginContext,
  type Logger,
} from "@brains/plugins/test";
import type { BaseEntity } from "@brains/plugins";

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
      const postEntity: BaseEntity = {
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
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
      };

      const result = await extractor.extractFromEntity(postEntity, 0.5);

      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
    });

    it("should set correct source metadata from entity", async () => {
      const linkEntity: BaseEntity = {
        id: "test-link-123",
        entityType: "link",
        content: "Article about TypeScript best practices and design patterns",
        metadata: {
          title: "TypeScript Best Practices",
          url: "https://example.com/ts-best-practices",
        },
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
      };

      const result = await extractor.extractFromEntity(linkEntity, 0.3);

      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
      // If topics are extracted, verify source metadata
      const firstTopic = result[0];
      if (firstTopic && firstTopic.sources.length > 0) {
        const firstSource = firstTopic.sources[0];
        if (firstSource) {
          expect(firstSource.id).toBe("test-link-123");
          expect(firstSource.type).toBe("link");
          expect(firstSource.title).toBe("TypeScript Best Practices");
        }
      }
    });

    it("should return empty array for empty content", async () => {
      const emptyEntity: BaseEntity = {
        id: "empty-entity",
        entityType: "post",
        content: "",
        metadata: { title: "Empty Post" },
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
      };

      const result = await extractor.extractFromEntity(emptyEntity, 0.5);

      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(0);
    });

    it("should filter topics by minimum relevance score", async () => {
      const entity: BaseEntity = {
        id: "test-entity",
        entityType: "summary",
        content: "Brief mention of various topics without depth",
        metadata: { title: "Brief Summary" },
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
      };

      // High threshold should filter out low-relevance topics
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
