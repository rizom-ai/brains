import { describe, expect, test, spyOn } from "bun:test";
import { RSSDataSource } from "../src/datasources/rss-datasource";
import {
  createSilentLogger,
  createMockEntityService as createBaseMockEntityService,
} from "@brains/test-utils";
import type { IEntityService, BaseDataSourceContext } from "@brains/plugins";
import type { BlogPost } from "../src/schemas/blog-post";
import { z } from "zod";
import { computeContentHash } from "@brains/utils";

describe("RSSDataSource", () => {
  const createMockEntityService = (posts: BlogPost[]): IEntityService => {
    const mockEntityService = createBaseMockEntityService();
    spyOn(mockEntityService, "listEntities").mockResolvedValue(posts);
    return mockEntityService;
  };

  const mockContext: BaseDataSourceContext = {};

  const post1Content =
    "---\ntitle: First Post\nslug: first-post\nexcerpt: Excerpt 1\nauthor: John\nstatus: published\npublishedAt: 2025-01-15T10:00:00.000Z\n---\nContent 1";
  const post2Content =
    "---\ntitle: Second Post\nslug: second-post\nexcerpt: Excerpt 2\nauthor: Jane\nstatus: published\npublishedAt: 2025-01-10T10:00:00.000Z\n---\nContent 2";
  const draftContent =
    "---\ntitle: Draft Post\nslug: draft-post\nexcerpt: Draft excerpt\nauthor: Author\nstatus: draft\n---\nDraft content";

  const samplePosts: BlogPost[] = [
    {
      id: "post-1",
      entityType: "post",
      content: post1Content,
      contentHash: computeContentHash(post1Content),
      created: "2025-01-01T10:00:00.000Z",
      updated: "2025-01-01T10:00:00.000Z",
      metadata: {
        title: "First Post",
        slug: "first-post",
        status: "published",
        publishedAt: "2025-01-15T10:00:00.000Z",
      },
    },
    {
      id: "post-2",
      entityType: "post",
      content: post2Content,
      contentHash: computeContentHash(post2Content),
      created: "2025-01-02T10:00:00.000Z",
      updated: "2025-01-02T10:00:00.000Z",
      metadata: {
        title: "Second Post",
        slug: "second-post",
        status: "published",
        publishedAt: "2025-01-10T10:00:00.000Z",
      },
    },
    {
      id: "draft-post",
      entityType: "post",
      content: draftContent,
      contentHash: computeContentHash(draftContent),
      created: "2025-01-03T10:00:00.000Z",
      updated: "2025-01-03T10:00:00.000Z",
      metadata: {
        title: "Draft Post",
        slug: "draft-post",
        status: "draft",
      },
    },
  ];

  describe("metadata", () => {
    test("should have correct datasource ID", () => {
      const entityService = createMockEntityService([]);
      const logger = createSilentLogger();
      const datasource = new RSSDataSource(entityService, logger);

      expect(datasource.id).toBe("blog:rss");
    });

    test("should have descriptive name", () => {
      const entityService = createMockEntityService([]);
      const logger = createSilentLogger();
      const datasource = new RSSDataSource(entityService, logger);

      expect(datasource.name).toBe("Blog RSS Feed DataSource");
    });

    test("should have description mentioning RSS 2.0", () => {
      const entityService = createMockEntityService([]);
      const logger = createSilentLogger();
      const datasource = new RSSDataSource(entityService, logger);

      expect(datasource.description).toContain("RSS 2.0");
    });
  });

  describe("fetch", () => {
    test("should fetch published posts only", async () => {
      const entityService = createMockEntityService(samplePosts);
      const logger = createSilentLogger();
      const datasource = new RSSDataSource(entityService, logger);

      const outputSchema = z.object({ xml: z.string() });
      const result = await datasource.fetch(
        {
          siteUrl: "https://example.com",
          title: "My Blog",
          description: "Blog description",
        },
        outputSchema,
        mockContext,
      );

      expect(result.xml).toContain("<title>First Post</title>");
      expect(result.xml).toContain("<title>Second Post</title>");
      expect(result.xml).not.toContain("<title>Draft Post</title>");
    });

    test("should generate valid RSS 2.0 XML", async () => {
      const entityService = createMockEntityService(samplePosts);
      const logger = createSilentLogger();
      const datasource = new RSSDataSource(entityService, logger);

      const outputSchema = z.object({ xml: z.string() });
      const result = await datasource.fetch(
        {
          siteUrl: "https://example.com",
          title: "My Blog",
          description: "Blog description",
        },
        outputSchema,
        mockContext,
      );

      expect(result.xml).toContain('<?xml version="1.0"');
      expect(result.xml).toContain('<rss version="2.0"');
      expect(result.xml).toContain("</rss>");
    });

    test("should use query parameters in RSS config", async () => {
      const entityService = createMockEntityService(samplePosts);
      const logger = createSilentLogger();
      const datasource = new RSSDataSource(entityService, logger);

      const outputSchema = z.object({ xml: z.string() });
      const result = await datasource.fetch(
        {
          siteUrl: "https://example.com",
          title: "Test Blog Title",
          description: "Test Blog Description",
          language: "fr-fr",
          copyright: "© 2025",
        },
        outputSchema,
        mockContext,
      );

      expect(result.xml).toContain("<title>Test Blog Title</title>");
      expect(result.xml).toContain(
        "<description>Test Blog Description</description>",
      );
      expect(result.xml).toContain("<language>fr-fr</language>");
      expect(result.xml).toContain("<copyright>© 2025</copyright>");
    });

    test("should default language to en-us", async () => {
      const entityService = createMockEntityService(samplePosts);
      const logger = createSilentLogger();
      const datasource = new RSSDataSource(entityService, logger);

      const outputSchema = z.object({ xml: z.string() });
      const result = await datasource.fetch(
        {
          siteUrl: "https://example.com",
          title: "My Blog",
          description: "Blog description",
        },
        outputSchema,
        mockContext,
      );

      expect(result.xml).toContain("<language>en-us</language>");
    });

    test("should parse frontmatter from post content", async () => {
      const entityService = createMockEntityService(samplePosts);
      const logger = createSilentLogger();
      const datasource = new RSSDataSource(entityService, logger);

      const outputSchema = z.object({ xml: z.string() });
      const result = await datasource.fetch(
        {
          siteUrl: "https://example.com",
          title: "My Blog",
          description: "Blog description",
        },
        outputSchema,
        mockContext,
      );

      // Should extract title and author from frontmatter
      expect(result.xml).toContain("<author>John</author>");
      expect(result.xml).toContain("<author>Jane</author>");
      expect(result.xml).toContain("<description>Excerpt 1</description>");
    });

    test("should validate query parameters", async () => {
      const entityService = createMockEntityService(samplePosts);
      const logger = createSilentLogger();
      const datasource = new RSSDataSource(entityService, logger);

      const outputSchema = z.object({ xml: z.string() });

      // Missing required fields should throw
      // eslint-disable-next-line @typescript-eslint/await-thenable
      await expect(
        datasource.fetch(
          {
            // Missing siteUrl, title, description
          },
          outputSchema,
          mockContext,
        ),
      ).rejects.toThrow();
    });

    test("should validate invalid URL", async () => {
      const entityService = createMockEntityService(samplePosts);
      const logger = createSilentLogger();
      const datasource = new RSSDataSource(entityService, logger);

      const outputSchema = z.object({ xml: z.string() });

      // eslint-disable-next-line @typescript-eslint/await-thenable
      await expect(
        datasource.fetch(
          {
            siteUrl: "not-a-url",
            title: "My Blog",
            description: "Description",
          },
          outputSchema,
          mockContext,
        ),
      ).rejects.toThrow();
    });

    test("should return result matching output schema", async () => {
      const entityService = createMockEntityService(samplePosts);
      const logger = createSilentLogger();
      const datasource = new RSSDataSource(entityService, logger);

      const outputSchema = z.object({ xml: z.string() });
      const result = await datasource.fetch(
        {
          siteUrl: "https://example.com",
          title: "My Blog",
          description: "Blog description",
        },
        outputSchema,
        mockContext,
      );

      expect(result).toHaveProperty("xml");
      expect(typeof result.xml).toBe("string");
    });

    test("should handle no published posts", async () => {
      const draftPost = samplePosts[2];
      if (!draftPost) throw new Error("Draft post not found");

      const draftOnly: BlogPost[] = [draftPost]; // Only draft
      const entityService = createMockEntityService(draftOnly);
      const logger = createSilentLogger();
      const datasource = new RSSDataSource(entityService, logger);

      const outputSchema = z.object({ xml: z.string() });
      const result = await datasource.fetch(
        {
          siteUrl: "https://example.com",
          title: "My Blog",
          description: "Blog description",
        },
        outputSchema,
        mockContext,
      );

      expect(result.xml).toContain("<channel>");
      expect(result.xml).not.toContain("<item>");
    });

    test("should list entities with limit 1000", async () => {
      const entityService = createMockEntityService(samplePosts);
      const logger = createSilentLogger();
      const datasource = new RSSDataSource(entityService, logger);

      const outputSchema = z.object({ xml: z.string() });
      await datasource.fetch(
        {
          siteUrl: "https://example.com",
          title: "My Blog",
          description: "Blog description",
        },
        outputSchema,
        mockContext,
      );

      expect(entityService.listEntities).toHaveBeenCalledWith("post", {
        limit: 1000,
      });
    });
  });
});
