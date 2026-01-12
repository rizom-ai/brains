import { describe, it, expect, beforeEach, mock, spyOn } from "bun:test";
import { SiteBuilder } from "../../src/lib/site-builder";
import type { EntityRouteConfig } from "../../src/config";
import {
  createSilentLogger,
  createMockServicePluginContext,
} from "@brains/test-utils";
import type { ServicePluginContext } from "@brains/plugins";
import type { RouteRegistry } from "../../src/lib/route-registry";
import type { SiteInfoService } from "../../src/services/site-info-service";
import type { ProfileService } from "@brains/plugins";
import { computeContentHash, z } from "@brains/utils";

// Type for accessing private methods in tests
interface SiteBuilderTestable {
  enrichWithUrls<T>(
    data: T,
    generateEntityUrl: (entityType: string, slug: string) => string,
  ): Promise<T>;
}

describe("SiteBuilder - URL Enrichment", () => {
  let siteBuilder: SiteBuilder;
  let testableSiteBuilder: SiteBuilderTestable;
  let mockContext: ServicePluginContext;
  let mockRouteRegistry: Partial<RouteRegistry>;
  let mockSiteInfoService: Partial<SiteInfoService>;
  let mockProfileService: Partial<ProfileService>;
  const logger = createSilentLogger();

  const entityRouteConfig: EntityRouteConfig = {
    post: {
      label: "Blog Post",
      pluralName: "posts",
    },
    deck: {
      label: "Presentation",
    },
  };

  beforeEach(() => {
    mockContext = createMockServicePluginContext({ logger });
    // Override specific methods for this test
    spyOn(mockContext.views, "get").mockReturnValue({
      name: "test-template",
      pluginId: "test",
      schema: z.object({}),
      renderers: {},
      interactive: false,
    });

    mockRouteRegistry = {
      list: mock().mockReturnValue([]),
      register: mock(),
      getNavigationItems: mock().mockReturnValue([]),
    };

    mockSiteInfoService = {
      getSiteInfo: mock().mockReturnValue({
        title: "Test Site",
        description: "Test Description",
      }),
    };

    mockProfileService = {
      getProfile: (): { name: string } => ({ name: "Test" }),
    };

    siteBuilder = SiteBuilder.createFresh(
      logger,
      mockContext,
      mockRouteRegistry as RouteRegistry,
      mockSiteInfoService as SiteInfoService,
      mockProfileService as ProfileService,
      () => ({
        build: mock().mockResolvedValue({ success: true }),
        clean: mock().mockResolvedValue(undefined),
      }),
      entityRouteConfig,
    );
    testableSiteBuilder = siteBuilder as unknown as SiteBuilderTestable;
  });

  describe("enrichWithUrls", () => {
    const generateEntityUrl = (entityType: string, slug: string): string => {
      return `/${entityType}s/${slug}`;
    };

    it("should add url and typeLabel to entity with slug metadata", async () => {
      const content = "Test content";
      const entity = {
        id: "post-1",
        entityType: "post",
        content,
        contentHash: computeContentHash(content),
        created: "2025-01-01T00:00:00.000Z",
        updated: "2025-01-01T00:00:00.000Z",
        metadata: { slug: "test-post", title: "Test Post" },
        url: "",
        typeLabel: "",
      };

      const result = await testableSiteBuilder.enrichWithUrls(
        entity,
        generateEntityUrl,
      );

      expect(result.url).toBe("/posts/test-post");
      expect(result.typeLabel).toBe("Blog Post");
    });

    it("should handle array of entities", async () => {
      const content1 = "Content 1";
      const content2 = "Content 2";
      const entities = [
        {
          id: "post-1",
          entityType: "post",
          content: content1,
          contentHash: computeContentHash(content1),
          created: "2025-01-01T00:00:00.000Z",
          updated: "2025-01-01T00:00:00.000Z",
          metadata: { slug: "post-1" },
          url: "",
          typeLabel: "",
        },
        {
          id: "post-2",
          entityType: "post",
          content: content2,
          contentHash: computeContentHash(content2),
          created: "2025-01-02T00:00:00.000Z",
          updated: "2025-01-02T00:00:00.000Z",
          metadata: { slug: "post-2" },
          url: "",
          typeLabel: "",
        },
      ];

      const result = await testableSiteBuilder.enrichWithUrls(
        entities,
        generateEntityUrl,
      );

      expect(Array.isArray(result)).toBe(true);
      expect(result).toHaveLength(2);
      const first = result[0];
      const second = result[1];
      if (!first || !second) throw new Error("Expected two elements");
      expect(first.url).toBe("/posts/post-1");
      expect(first.typeLabel).toBe("Blog Post");
      expect(second.url).toBe("/posts/post-2");
      expect(second.typeLabel).toBe("Blog Post");
    });

    it("should recursively enrich nested entities", async () => {
      const postContent = "Content";
      const deckContent = "Deck content";
      const data = {
        post: {
          id: "post-1",
          entityType: "post",
          content: postContent,
          contentHash: computeContentHash(postContent),
          created: "2025-01-01T00:00:00.000Z",
          updated: "2025-01-01T00:00:00.000Z",
          metadata: { slug: "test-post" },
          url: "",
          typeLabel: "",
        },
        relatedDecks: [
          {
            id: "deck-1",
            entityType: "deck",
            content: deckContent,
            contentHash: computeContentHash(deckContent),
            created: "2025-01-01T00:00:00.000Z",
            updated: "2025-01-01T00:00:00.000Z",
            metadata: { slug: "test-deck" },
            url: "",
            typeLabel: "",
          },
        ],
      };

      const result = await testableSiteBuilder.enrichWithUrls(
        data,
        generateEntityUrl,
      );

      expect(result.post.url).toBe("/posts/test-post");
      expect(result.post.typeLabel).toBe("Blog Post");
      const firstDeck = result.relatedDecks[0];
      if (!firstDeck) throw new Error("Expected deck element");
      expect(firstDeck.url).toBe("/decks/test-deck");
      expect(firstDeck.typeLabel).toBe("Presentation");
    });

    it("should use capitalized entityType as fallback label", async () => {
      const content = "Content";
      const entity = {
        id: "note-1",
        entityType: "note",
        content,
        contentHash: computeContentHash(content),
        created: "2025-01-01T00:00:00.000Z",
        updated: "2025-01-01T00:00:00.000Z",
        metadata: { slug: "test-note" },
        url: "",
        typeLabel: "",
      };

      const result = await testableSiteBuilder.enrichWithUrls(
        entity,
        generateEntityUrl,
      );

      expect(result.typeLabel).toBe("Note");
    });

    it("should not modify non-entity objects", async () => {
      const data = {
        title: "Test",
        count: 42,
        metadata: { foo: "bar" },
      };

      const result = await testableSiteBuilder.enrichWithUrls(
        data,
        generateEntityUrl,
      );

      expect(result).toEqual(data);
    });

    it("should handle null and undefined", async () => {
      expect(
        await testableSiteBuilder.enrichWithUrls(null, generateEntityUrl),
      ).toBeNull();
      expect(
        await testableSiteBuilder.enrichWithUrls(undefined, generateEntityUrl),
      ).toBeUndefined();
    });

    it("should handle primitive values", async () => {
      expect(
        await testableSiteBuilder.enrichWithUrls("string", generateEntityUrl),
      ).toBe("string");
      expect(
        await testableSiteBuilder.enrichWithUrls(42, generateEntityUrl),
      ).toBe(42);
      expect(
        await testableSiteBuilder.enrichWithUrls(true, generateEntityUrl),
      ).toBe(true);
    });

    it("should preserve other entity fields", async () => {
      const content = "Content";
      const entity = {
        id: "post-1",
        entityType: "post",
        content,
        contentHash: computeContentHash(content),
        created: "2025-01-01T00:00:00.000Z",
        updated: "2025-01-01T00:00:00.000Z",
        metadata: {
          slug: "test",
          title: "Test",
          author: "John",
          customField: "value",
        },
        frontmatter: { title: "Test" },
        body: "Body content",
        url: "",
        typeLabel: "",
      };

      const result = await testableSiteBuilder.enrichWithUrls(
        entity,
        generateEntityUrl,
      );

      expect(result.id).toBe("post-1");
      expect(result.entityType).toBe("post");
      expect(result.content).toBe("Content");
      expect(result.metadata.customField).toBe("value");
      expect(result.frontmatter).toEqual({ title: "Test" });
      expect(result.body).toBe("Body content");
      expect(result.url).toBe("/posts/test");
      expect(result.typeLabel).toBe("Blog Post");
    });

    it("should handle entity without entityRouteConfig", async () => {
      const builderWithoutConfig = SiteBuilder.createFresh(
        logger,
        mockContext,
        mockRouteRegistry as RouteRegistry,
        mockSiteInfoService as SiteInfoService,
        mockProfileService as ProfileService,
        () => ({
          build: mock().mockResolvedValue({ success: true }),
          clean: mock().mockResolvedValue(undefined),
        }),
        undefined,
      );
      const testableBuilderWithoutConfig =
        builderWithoutConfig as unknown as SiteBuilderTestable;

      const content = "Content";
      const entity = {
        id: "post-1",
        entityType: "post",
        content,
        contentHash: computeContentHash(content),
        created: "2025-01-01T00:00:00.000Z",
        updated: "2025-01-01T00:00:00.000Z",
        metadata: { slug: "test" },
        url: "",
        typeLabel: "",
      };

      const result = await testableBuilderWithoutConfig.enrichWithUrls(
        entity,
        generateEntityUrl,
      );

      expect(result.url).toBe("/posts/test");
      expect(result.typeLabel).toBe("Post");
    });

    it("should resolve coverImageUrl from entity content frontmatter", async () => {
      // Entity with coverImageId in frontmatter
      const content = `---
title: Test Project
slug: test-project
coverImageId: project-cover-image
---
# Test Project`;
      const entity = {
        id: "project-1",
        entityType: "project",
        content,
        contentHash: computeContentHash(content),
        created: "2025-01-01T00:00:00.000Z",
        updated: "2025-01-01T00:00:00.000Z",
        metadata: { slug: "test-project", title: "Test Project" },
      };

      // Mock entityService.getEntity to return the image
      spyOn(mockContext.entityService, "getEntity").mockResolvedValue({
        id: "project-cover-image",
        entityType: "image",
        content: "data:image/png;base64,abc123",
        contentHash: "hash",
        created: "2025-01-01T00:00:00.000Z",
        updated: "2025-01-01T00:00:00.000Z",
        metadata: {
          alt: "Cover image",
          title: "Cover",
          width: 800,
          height: 600,
        },
      });

      const result = await testableSiteBuilder.enrichWithUrls(
        entity,
        generateEntityUrl,
      );

      // Result is enriched with coverImageUrl and url
      const enriched = result as { coverImageUrl?: string; url?: string };
      expect(enriched.coverImageUrl).toBe("data:image/png;base64,abc123");
      expect(enriched.url).toBe("/projects/test-project");
    });

    it("should not add coverImageUrl when entity has no coverImageId", async () => {
      // Entity without coverImageId
      const content = `---
title: Test Project
slug: test-project
---
# Test Project`;
      const entity = {
        id: "project-1",
        entityType: "project",
        content,
        contentHash: computeContentHash(content),
        created: "2025-01-01T00:00:00.000Z",
        updated: "2025-01-01T00:00:00.000Z",
        metadata: { slug: "test-project", title: "Test Project" },
      };

      const result = await testableSiteBuilder.enrichWithUrls(
        entity,
        generateEntityUrl,
      );

      // Result is enriched - coverImageUrl should not be present
      const enriched = result as { coverImageUrl?: string; url?: string };
      expect(enriched.coverImageUrl).toBeUndefined();
      expect(enriched.url).toBe("/projects/test-project");
    });
  });
});
