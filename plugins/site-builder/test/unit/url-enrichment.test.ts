import { describe, it, expect, beforeEach, mock } from "bun:test";
import { SiteBuilder } from "../../src/lib/site-builder";
import type { EntityRouteConfig } from "../../src/config";
import { createSilentLogger } from "@brains/plugins";
import type { ServicePluginContext } from "@brains/plugins";
import type { RouteRegistry } from "../../src/lib/route-registry";
import type { SiteInfoService } from "../../src/services/site-info-service";
import type { ProfileService } from "@brains/profile-service";
import { computeContentHash } from "@brains/utils";

// Type for accessing private methods in tests
interface SiteBuilderTestable {
  enrichWithUrls<T>(
    data: T,
    generateEntityUrl: (entityType: string, slug: string) => string,
  ): T;
}

describe("SiteBuilder - URL Enrichment", () => {
  let siteBuilder: SiteBuilder;
  let testableSiteBuilder: SiteBuilderTestable;
  let mockContext: Partial<ServicePluginContext>;
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
    mockContext = {
      logger,
      registerTemplates: mock(),
      getViewTemplate: mock().mockReturnValue({
        name: "test-template",
        component: () => "<div>Test</div>",
      }),
      listViewTemplates: mock().mockReturnValue([]),
      resolveContent: mock(),
      entityService: {
        listEntities: mock().mockResolvedValue([]),
        getEntityTypes: mock().mockReturnValue([]),
      } as unknown as ServicePluginContext["entityService"],
    };

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
      mockContext as ServicePluginContext,
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

    it("should add url and typeLabel to entity with slug metadata", () => {
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

      const result = testableSiteBuilder.enrichWithUrls(
        entity,
        generateEntityUrl,
      );

      expect(result.url).toBe("/posts/test-post");
      expect(result.typeLabel).toBe("Blog Post");
    });

    it("should handle array of entities", () => {
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

      const result = testableSiteBuilder.enrichWithUrls(
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

    it("should recursively enrich nested entities", () => {
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

      const result = testableSiteBuilder.enrichWithUrls(
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

    it("should use capitalized entityType as fallback label", () => {
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

      const result = testableSiteBuilder.enrichWithUrls(
        entity,
        generateEntityUrl,
      );

      expect(result.typeLabel).toBe("Note");
    });

    it("should not modify non-entity objects", () => {
      const data = {
        title: "Test",
        count: 42,
        metadata: { foo: "bar" },
      };

      const result = testableSiteBuilder.enrichWithUrls(
        data,
        generateEntityUrl,
      );

      expect(result).toEqual(data);
    });

    it("should handle null and undefined", () => {
      expect(
        testableSiteBuilder.enrichWithUrls(null, generateEntityUrl),
      ).toBeNull();
      expect(
        testableSiteBuilder.enrichWithUrls(undefined, generateEntityUrl),
      ).toBeUndefined();
    });

    it("should handle primitive values", () => {
      expect(
        testableSiteBuilder.enrichWithUrls("string", generateEntityUrl),
      ).toBe("string");
      expect(testableSiteBuilder.enrichWithUrls(42, generateEntityUrl)).toBe(
        42,
      );
      expect(testableSiteBuilder.enrichWithUrls(true, generateEntityUrl)).toBe(
        true,
      );
    });

    it("should preserve other entity fields", () => {
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

      const result = testableSiteBuilder.enrichWithUrls(
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

    it("should handle entity without entityRouteConfig", () => {
      const builderWithoutConfig = SiteBuilder.createFresh(
        logger,
        mockContext as ServicePluginContext,
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

      const result = testableBuilderWithoutConfig.enrichWithUrls(
        entity,
        generateEntityUrl,
      );

      expect(result.url).toBe("/posts/test");
      expect(result.typeLabel).toBe("Post");
    });
  });
});
