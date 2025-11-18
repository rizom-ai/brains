import { describe, it, expect, beforeEach, mock } from "bun:test";
import { SiteBuilder } from "../../src/lib/site-builder";
import type { EntityRouteConfig } from "../../src/config";
import { createSilentLogger } from "@brains/plugins";
import type { ServicePluginContext } from "@brains/plugins";
import type { RouteRegistry } from "../../src/lib/route-registry";
import type { SiteInfoService } from "../../src/services/site-info-service";
import type { ProfileService } from "@brains/profile-service";

describe("SiteBuilder - URL Enrichment", () => {
  let siteBuilder: SiteBuilder;
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
    // Create mock context with required methods
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
      getProfile: () => ({ name: "Test" }),
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
  });

  describe("enrichWithUrls", () => {
    const generateEntityUrl = (entityType: string, slug: string): string => {
      return `/${entityType}s/${slug}`;
    };

    it("should add url and typeLabel to entity with slug metadata", () => {
      const entity = {
        id: "post-1",
        entityType: "post",
        content: "Test content",
        created: "2025-01-01T00:00:00.000Z",
        updated: "2025-01-01T00:00:00.000Z",
        metadata: {
          slug: "test-post",
          title: "Test Post",
        },
      };

      const result = (siteBuilder as any).enrichWithUrls(
        entity,
        generateEntityUrl,
      );

      expect(result).toMatchObject({
        ...entity,
        url: "/posts/test-post",
        typeLabel: "Blog Post",
      });
    });

    it("should handle array of entities", () => {
      const entities = [
        {
          id: "post-1",
          entityType: "post",
          content: "Content 1",
          created: "2025-01-01T00:00:00.000Z",
          updated: "2025-01-01T00:00:00.000Z",
          metadata: { slug: "post-1" },
        },
        {
          id: "post-2",
          entityType: "post",
          content: "Content 2",
          created: "2025-01-02T00:00:00.000Z",
          updated: "2025-01-02T00:00:00.000Z",
          metadata: { slug: "post-2" },
        },
      ];

      const result = (siteBuilder as any).enrichWithUrls(
        entities,
        generateEntityUrl,
      );

      expect(Array.isArray(result)).toBe(true);
      expect((result as any)[0].url).toBe("/posts/post-1");
      expect((result as any)[0].typeLabel).toBe("Blog Post");
      expect((result as any)[1].url).toBe("/posts/post-2");
      expect((result as any)[1].typeLabel).toBe("Blog Post");
    });

    it("should recursively enrich nested entities", () => {
      const data = {
        post: {
          id: "post-1",
          entityType: "post",
          content: "Content",
          created: "2025-01-01T00:00:00.000Z",
          updated: "2025-01-01T00:00:00.000Z",
          metadata: { slug: "test-post" },
        },
        relatedDecks: [
          {
            id: "deck-1",
            entityType: "deck",
            content: "Deck content",
            created: "2025-01-01T00:00:00.000Z",
            updated: "2025-01-01T00:00:00.000Z",
            metadata: { slug: "test-deck" },
          },
        ],
      };

      const result = (siteBuilder as any).enrichWithUrls(
        data,
        generateEntityUrl,
      ) as any;

      expect(result.post.url).toBe("/posts/test-post");
      expect(result.post.typeLabel).toBe("Blog Post");
      expect(result.relatedDecks[0].url).toBe("/decks/test-deck");
      expect(result.relatedDecks[0].typeLabel).toBe("Presentation");
    });

    it("should use capitalized entityType as fallback label", () => {
      const entity = {
        id: "note-1",
        entityType: "note",
        content: "Content",
        created: "2025-01-01T00:00:00.000Z",
        updated: "2025-01-01T00:00:00.000Z",
        metadata: { slug: "test-note" },
      };

      const result = (siteBuilder as any).enrichWithUrls(
        entity,
        generateEntityUrl,
      );

      expect(result.typeLabel).toBe("Note"); // Capitalized fallback
    });

    it("should not modify non-entity objects", () => {
      const data = {
        title: "Test",
        count: 42,
        metadata: { foo: "bar" }, // Has metadata but not entity structure
      };

      const result = (siteBuilder as any).enrichWithUrls(
        data,
        generateEntityUrl,
      );

      expect(result).toEqual(data);
      expect((result as any).url).toBeUndefined();
      expect((result as any).typeLabel).toBeUndefined();
    });

    it("should handle null and undefined", () => {
      expect(
        (siteBuilder as any).enrichWithUrls(null, generateEntityUrl),
      ).toBeNull();
      expect(
        (siteBuilder as any).enrichWithUrls(undefined, generateEntityUrl),
      ).toBeUndefined();
    });

    it("should handle primitive values", () => {
      expect(
        (siteBuilder as any).enrichWithUrls("string", generateEntityUrl),
      ).toBe("string");
      expect((siteBuilder as any).enrichWithUrls(42, generateEntityUrl)).toBe(
        42,
      );
      expect((siteBuilder as any).enrichWithUrls(true, generateEntityUrl)).toBe(
        true,
      );
    });

    it("should preserve other entity fields", () => {
      const entity = {
        id: "post-1",
        entityType: "post",
        content: "Content",
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
      };

      const result = (siteBuilder as any).enrichWithUrls(
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
        undefined, // No entityRouteConfig
      );

      const entity = {
        id: "post-1",
        entityType: "post",
        content: "Content",
        created: "2025-01-01T00:00:00.000Z",
        updated: "2025-01-01T00:00:00.000Z",
        metadata: { slug: "test" },
      };

      const result = (builderWithoutConfig as any).enrichWithUrls(
        entity,
        generateEntityUrl,
      );

      expect(result.url).toBe("/posts/test");
      expect(result.typeLabel).toBe("Post"); // Capitalized entityType
    });
  });
});
