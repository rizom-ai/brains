import { describe, it, expect, beforeEach, spyOn } from "bun:test";
import { enrichWithUrls } from "../../src/lib/content-enrichment";
import { createSiteBuilderServices } from "../test-helpers";
import type { EntityDisplayMap } from "../../src/config";
import {
  createSilentLogger,
  createMockServicePluginContext,
  createTestEntity,
} from "@brains/test-utils";
import type { ServicePluginContext } from "@brains/plugins";
import type { SiteImageLookup } from "@brains/site-engine";
import { EntityUrlGenerator } from "@brains/site-composition";
import { z } from "@brains/utils/zod";

describe("SiteBuilder - URL Enrichment", () => {
  let mockContext: ServicePluginContext;
  const logger = createSilentLogger();

  const entityDisplay: EntityDisplayMap = {
    post: {
      label: "Blog Post",
      pluralName: "posts",
    },
    deck: {
      label: "Presentation",
    },
  };

  const urlLabelSchema = z.object({
    url: z.string(),
    typeLabel: z.string(),
  });

  const enrich = (
    data: unknown,
    display: EntityDisplayMap | undefined = entityDisplay,
  ): Promise<unknown> =>
    enrichWithUrls(data, {
      pipelineContext: {
        services: createSiteBuilderServices(mockContext),
        entityDisplay: display,
      },
      urlGenerator: EntityUrlGenerator.getInstance(),
    });

  beforeEach(() => {
    mockContext = createMockServicePluginContext({ logger });
    EntityUrlGenerator.getInstance().configure(entityDisplay);
  });

  describe("enrichWithUrls", () => {
    it("should add url and typeLabel to entity with slug metadata", async () => {
      const content = "Test content";
      const entity = {
        ...createTestEntity("post", {
          id: "post-1",
          content,
          created: "2025-01-01T00:00:00.000Z",
          updated: "2025-01-01T00:00:00.000Z",
          metadata: { slug: "test-post", title: "Test Post" },
        }),
        url: "",
        typeLabel: "",
      };

      const result = urlLabelSchema.parse(await enrich(entity));

      expect(result.url).toBe("/posts/test-post");
      expect(result.typeLabel).toBe("Blog Post");
    });

    it("should handle array of entities", async () => {
      const entities = [
        {
          ...createTestEntity("post", {
            id: "post-1",
            content: "Content 1",
            created: "2025-01-01T00:00:00.000Z",
            updated: "2025-01-01T00:00:00.000Z",
            metadata: { slug: "post-1" },
          }),
          url: "",
          typeLabel: "",
        },
        {
          ...createTestEntity("post", {
            id: "post-2",
            content: "Content 2",
            created: "2025-01-02T00:00:00.000Z",
            updated: "2025-01-02T00:00:00.000Z",
            metadata: { slug: "post-2" },
          }),
          url: "",
          typeLabel: "",
        },
      ];

      const result = z.array(urlLabelSchema).parse(await enrich(entities));

      expect(result).toHaveLength(2);
      expect(result[0]?.url).toBe("/posts/post-1");
      expect(result[0]?.typeLabel).toBe("Blog Post");
      expect(result[1]?.url).toBe("/posts/post-2");
      expect(result[1]?.typeLabel).toBe("Blog Post");
    });

    it("should recursively enrich nested entities", async () => {
      const data = {
        post: {
          ...createTestEntity("post", {
            id: "post-1",
            content: "Content",
            created: "2025-01-01T00:00:00.000Z",
            updated: "2025-01-01T00:00:00.000Z",
            metadata: { slug: "test-post" },
          }),
          url: "",
          typeLabel: "",
        },
        relatedDecks: [
          {
            ...createTestEntity("deck", {
              id: "deck-1",
              content: "Deck content",
              created: "2025-01-01T00:00:00.000Z",
              updated: "2025-01-01T00:00:00.000Z",
              metadata: { slug: "test-deck" },
            }),
            url: "",
            typeLabel: "",
          },
        ],
      };

      const result = z
        .object({
          post: urlLabelSchema,
          relatedDecks: z.array(urlLabelSchema),
        })
        .parse(await enrich(data));

      expect(result.post.url).toBe("/posts/test-post");
      expect(result.post.typeLabel).toBe("Blog Post");
      expect(result.relatedDecks[0]?.url).toBe("/presentations/test-deck");
      expect(result.relatedDecks[0]?.typeLabel).toBe("Presentation");
    });

    it("should use capitalized entityType as fallback label", async () => {
      const entity = {
        ...createTestEntity("note", {
          id: "note-1",
          content: "Content",
          created: "2025-01-01T00:00:00.000Z",
          updated: "2025-01-01T00:00:00.000Z",
          metadata: { slug: "test-note" },
        }),
        url: "",
        typeLabel: "",
      };

      const result = urlLabelSchema.parse(await enrich(entity));

      expect(result.typeLabel).toBe("Note");
    });

    it("should not modify non-entity objects", async () => {
      const data = {
        title: "Test",
        count: 42,
        metadata: { foo: "bar" },
      };

      const result = await enrich(data);

      expect(result).toEqual(data);
    });

    it("should handle null and undefined", async () => {
      expect(await enrich(null)).toBeNull();
      expect(await enrich(undefined)).toBeUndefined();
    });

    it("should handle primitive values", async () => {
      expect(await enrich("string")).toBe("string");
      expect(await enrich(42)).toBe(42);
      expect(await enrich(true)).toBe(true);
    });

    it("should preserve other entity fields", async () => {
      const entity = {
        ...createTestEntity("post", {
          id: "post-1",
          content: "Content",
          created: "2025-01-01T00:00:00.000Z",
          updated: "2025-01-01T00:00:00.000Z",
          metadata: {
            slug: "test",
            title: "Test",
            author: "John",
            customField: "value",
          },
        }),
        frontmatter: { title: "Test" },
        body: "Body content",
        url: "",
        typeLabel: "",
      };

      const result = z
        .object({
          id: z.string(),
          entityType: z.string(),
          content: z.string(),
          metadata: z.record(z.unknown()),
          frontmatter: z.object({ title: z.string() }),
          body: z.string(),
          url: z.string(),
          typeLabel: z.string(),
        })
        .parse(await enrich(entity));

      expect(result.id).toBe("post-1");
      expect(result.entityType).toBe("post");
      expect(result.content).toBe("Content");
      expect(result.metadata["customField"]).toBe("value");
      expect(result.frontmatter).toEqual({ title: "Test" });
      expect(result.body).toBe("Body content");
      expect(result.url).toBe("/posts/test");
      expect(result.typeLabel).toBe("Blog Post");
    });

    it("should handle entity without entityDisplay", async () => {
      const entity = {
        ...createTestEntity("post", {
          id: "post-1",
          content: "Content",
          created: "2025-01-01T00:00:00.000Z",
          updated: "2025-01-01T00:00:00.000Z",
          metadata: { slug: "test" },
        }),
        url: "",
        typeLabel: "",
      };

      const result = urlLabelSchema.parse(
        await enrichWithUrls(entity, {
          pipelineContext: {
            services: createSiteBuilderServices(mockContext),
            entityDisplay: undefined,
          },
          urlGenerator: EntityUrlGenerator.getInstance(),
        }),
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
      const entity = createTestEntity("project", {
        id: "project-1",
        content,
        created: "2025-01-01T00:00:00.000Z",
        updated: "2025-01-01T00:00:00.000Z",
        metadata: { slug: "test-project", title: "Test Project" },
      });

      // Mock entityService.getEntity to return the image
      spyOn(mockContext.entityService, "getEntity").mockResolvedValue({
        id: "project-cover-image",
        entityType: "image",
        content: "data:image/png;base64,abc123",
        contentHash: "hash",
        visibility: "public",
        created: "2025-01-01T00:00:00.000Z",
        updated: "2025-01-01T00:00:00.000Z",
        metadata: {
          alt: "Cover image",
          title: "Cover",
          width: 800,
          height: 600,
        },
      });

      const result = z
        .object({
          coverImageUrl: z.string(),
          coverImageWidth: z.number(),
          coverImageHeight: z.number(),
          url: z.string(),
        })
        .parse(await enrich(entity));

      expect(result.coverImageUrl).toBe("data:image/png;base64,abc123");
      expect(result.coverImageWidth).toBe(800);
      expect(result.coverImageHeight).toBe(600);
      expect(result.url).toBe("/projects/test-project");
    });

    it("should resolve absolute ogImageUrl from ogImageId before coverImageId", async () => {
      const content = `---
title: Test Post
slug: test-post
coverImageId: cover-image
ogImageId: og-image
---
# Test Post`;
      const entity = createTestEntity("post", {
        id: "post-1",
        content,
        created: "2025-01-01T00:00:00.000Z",
        updated: "2025-01-01T00:00:00.000Z",
        metadata: { slug: "test-post", title: "Test Post" },
      });

      const imageBuildService: SiteImageLookup = {
        get: (id: string) =>
          id === "og-image"
            ? {
                src: "/images/og-image.png",
                width: 1200,
                height: 630,
              }
            : id === "cover-image"
              ? {
                  src: "/images/cover-image.png",
                  width: 800,
                  height: 600,
                }
              : undefined,
      };

      const result = z
        .object({
          ogImageUrl: z.string(),
          coverImageUrl: z.string(),
          url: z.string(),
        })
        .parse(
          await enrichWithUrls(entity, {
            pipelineContext: {
              services: createSiteBuilderServices(mockContext),
              entityDisplay,
            },
            imageBuildService,
            siteUrl: "https://example.com",
            urlGenerator: EntityUrlGenerator.getInstance(),
          }),
        );

      expect(result.ogImageUrl).toBe("https://example.com/images/og-image.png");
      expect(result.coverImageUrl).toBe("/images/cover-image.png");
      expect(result.url).toBe("/posts/test-post");
    });

    it("should fall back to cover image for ogImageUrl", async () => {
      const content = `---
title: Test Post
slug: test-post
coverImageId: cover-image
---
# Test Post`;
      const entity = createTestEntity("post", {
        id: "post-1",
        content,
        created: "2025-01-01T00:00:00.000Z",
        updated: "2025-01-01T00:00:00.000Z",
        metadata: { slug: "test-post", title: "Test Post" },
      });

      const imageBuildService: SiteImageLookup = {
        get: (id: string) =>
          id === "cover-image"
            ? {
                src: "/images/cover-image.png",
                width: 800,
                height: 600,
              }
            : undefined,
      };

      const result = z.object({ ogImageUrl: z.string() }).parse(
        await enrichWithUrls(entity, {
          pipelineContext: {
            services: createSiteBuilderServices(mockContext),
            entityDisplay,
          },
          imageBuildService,
          siteUrl: "https://example.com/",
          urlGenerator: EntityUrlGenerator.getInstance(),
        }),
      );

      expect(result.ogImageUrl).toBe(
        "https://example.com/images/cover-image.png",
      );
    });

    it("should omit ogImageUrl when it would only resolve to a data URL", async () => {
      // No imageBuildService → the head image falls back to direct resolution,
      // which yields a data: URL. A data URI is unusable as an og:image (social
      // crawlers reject it), so ogImageUrl must be omitted rather than emitted.
      const content = `---
title: Test Post
slug: test-post
ogImageId: og-image
---
# Test Post`;
      const entity = createTestEntity("post", {
        id: "post-1",
        content,
        created: "2025-01-01T00:00:00.000Z",
        updated: "2025-01-01T00:00:00.000Z",
        metadata: { slug: "test-post", title: "Test Post" },
      });

      spyOn(mockContext.entityService, "getEntity").mockResolvedValue({
        id: "og-image",
        entityType: "image",
        content: "data:image/png;base64,abc123",
        contentHash: "hash",
        visibility: "public",
        created: "2025-01-01T00:00:00.000Z",
        updated: "2025-01-01T00:00:00.000Z",
        metadata: {},
      });

      const result = z
        .object({ ogImageUrl: z.never().optional(), url: z.string() })
        .parse(await enrich(entity));

      expect(result.ogImageUrl).toBeUndefined();
      expect(result.url).toBe("/posts/test-post");
    });

    it("should not add coverImageUrl when entity has no coverImageId", async () => {
      // Entity without coverImageId
      const content = `---
title: Test Project
slug: test-project
---
# Test Project`;
      const entity = createTestEntity("project", {
        id: "project-1",
        content,
        created: "2025-01-01T00:00:00.000Z",
        updated: "2025-01-01T00:00:00.000Z",
        metadata: { slug: "test-project", title: "Test Project" },
      });

      const result = z
        .object({
          coverImageUrl: z.never().optional(),
          url: z.string(),
        })
        .parse(await enrich(entity));

      expect(result.coverImageUrl).toBeUndefined();
      expect(result.url).toBe("/projects/test-project");
    });
  });
});
