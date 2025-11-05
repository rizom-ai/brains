import { describe, expect, test, mock, beforeEach } from "bun:test";
import { createGenerateRSSTool } from "../src/tools/generate-rss";
import type { ServicePluginContext, ToolContext } from "@brains/plugins";
import type { BlogPost } from "../src/schemas/blog-post";
import { promises as fs } from "fs";
import { rm } from "fs/promises";

describe("Generate RSS Tool", () => {
  const samplePosts: BlogPost[] = [
    {
      id: "post-1",
      entityType: "post",
      content:
        "---\ntitle: First Post\nslug: first-post\nexcerpt: Excerpt 1\nauthor: John\nstatus: published\npublishedAt: 2025-01-15T10:00:00.000Z\n---\nContent 1",
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
      content:
        "---\ntitle: Second Post\nslug: second-post\nexcerpt: Excerpt 2\nauthor: Jane\nstatus: published\npublishedAt: 2025-01-10T10:00:00.000Z\n---\nContent 2",
      created: "2025-01-02T10:00:00.000Z",
      updated: "2025-01-02T10:00:00.000Z",
      metadata: {
        title: "Second Post",
        slug: "second-post",
        status: "published",
        publishedAt: "2025-01-10T10:00:00.000Z",
      },
    },
  ];

  const createMockContext = (posts: BlogPost[]): ServicePluginContext =>
    ({
      entityService: {
        listEntities: mock(async () => posts),
      },
    }) as unknown as ServicePluginContext;

  const mockToolContext: ToolContext = {
    interfaceType: "test",
    userId: "test-user",
  };

  const testOutputPath = "/tmp/test-feed.xml";

  beforeEach(async () => {
    // Clean up test file
    try {
      await rm(testOutputPath, { force: true });
    } catch {
      // Ignore if file doesn't exist
    }
  });

  describe("tool metadata", () => {
    test("should have correct tool name", () => {
      const context = createMockContext([]);
      const tool = createGenerateRSSTool(context);

      expect(tool.name).toBe("generate-rss");
    });

    test("should have descriptive description", () => {
      const context = createMockContext([]);
      const tool = createGenerateRSSTool(context);

      expect(tool.description).toContain("RSS");
      expect(tool.description).toContain("published");
    });

    test("should have correct input schema", () => {
      const context = createMockContext([]);
      const tool = createGenerateRSSTool(context);

      expect(tool.inputSchema).toHaveProperty("outputPath");
      expect(tool.inputSchema).toHaveProperty("siteUrl");
      expect(tool.inputSchema).toHaveProperty("title");
      expect(tool.inputSchema).toHaveProperty("description");
    });

    test("should be public visibility", () => {
      const context = createMockContext([]);
      const tool = createGenerateRSSTool(context);

      expect(tool.visibility).toBe("public");
    });
  });

  describe("RSS generation", () => {
    test("should generate RSS feed successfully", async () => {
      const context = createMockContext(samplePosts);
      const tool = createGenerateRSSTool(context);

      const result = await tool.handler(
        {
          outputPath: testOutputPath,
          siteUrl: "https://example.com",
          title: "My Blog",
          description: "Blog description",
        },
        mockToolContext,
      );

      expect(result.success).toBe(true);
      expect(result.message).toContain("2 posts");
      expect(result.message).toContain(testOutputPath);
    });

    test("should write RSS XML to file", async () => {
      const context = createMockContext(samplePosts);
      const tool = createGenerateRSSTool(context);

      await tool.handler(
        {
          outputPath: testOutputPath,
          siteUrl: "https://example.com",
          title: "My Blog",
          description: "Blog description",
        },
        mockToolContext,
      );

      const content = await fs.readFile(testOutputPath, "utf-8");
      expect(content).toContain('<?xml version="1.0"');
      expect(content).toContain('<rss version="2.0"');
      expect(content).toContain("<title>My Blog</title>");
    });

    test("should include only published posts", async () => {
      const postsWithDraft: BlogPost[] = [
        ...samplePosts,
        {
          id: "draft",
          entityType: "post",
          content:
            "---\ntitle: Draft\nslug: draft\nexcerpt: Draft excerpt\nauthor: Author\nstatus: draft\n---\nDraft",
          created: "2025-01-03T10:00:00.000Z",
          updated: "2025-01-03T10:00:00.000Z",
          metadata: {
            title: "Draft",
            slug: "draft",
            status: "draft",
          },
        },
      ];

      const context = createMockContext(postsWithDraft);
      const tool = createGenerateRSSTool(context);

      await tool.handler(
        {
          outputPath: testOutputPath,
          siteUrl: "https://example.com",
          title: "My Blog",
          description: "Blog description",
        },
        mockToolContext,
      );

      const content = await fs.readFile(testOutputPath, "utf-8");
      expect(content).not.toContain("<title>Draft</title>");
    });

    test("should create output directory if it doesn't exist", async () => {
      const context = createMockContext(samplePosts);
      const tool = createGenerateRSSTool(context);

      const nestedPath = "/tmp/rss-test-dir/subfolder/feed.xml";

      // Clean up first
      try {
        await rm("/tmp/rss-test-dir", { recursive: true, force: true });
      } catch {
        // Ignore
      }

      await tool.handler(
        {
          outputPath: nestedPath,
          siteUrl: "https://example.com",
          title: "My Blog",
          description: "Blog description",
        },
        mockToolContext,
      );

      const content = await fs.readFile(nestedPath, "utf-8");
      expect(content).toContain("<rss");

      // Clean up
      await rm("/tmp/rss-test-dir", { recursive: true, force: true });
    });

    test("should return data with post count and path", async () => {
      const context = createMockContext(samplePosts);
      const tool = createGenerateRSSTool(context);

      const result = await tool.handler(
        {
          outputPath: testOutputPath,
          siteUrl: "https://example.com",
          title: "My Blog",
          description: "Blog description",
        },
        mockToolContext,
      );

      expect(result.data).toHaveProperty("postsCount");
      expect(result.data).toHaveProperty("outputPath");
      expect(result.data?.["postsCount"]).toBe(2);
      expect(result.data?.["outputPath"]).toBe(testOutputPath);
    });
  });

  describe("RSS configuration", () => {
    test("should use provided title and description", async () => {
      const context = createMockContext(samplePosts);
      const tool = createGenerateRSSTool(context);

      await tool.handler(
        {
          outputPath: testOutputPath,
          siteUrl: "https://example.com",
          title: "Custom Title",
          description: "Custom Description",
        },
        mockToolContext,
      );

      const content = await fs.readFile(testOutputPath, "utf-8");
      expect(content).toContain("<title>Custom Title</title>");
      expect(content).toContain(
        "<description>Custom Description</description>",
      );
    });

    test("should use provided language", async () => {
      const context = createMockContext(samplePosts);
      const tool = createGenerateRSSTool(context);

      await tool.handler(
        {
          outputPath: testOutputPath,
          siteUrl: "https://example.com",
          title: "My Blog",
          description: "Description",
          language: "fr-fr",
        },
        mockToolContext,
      );

      const content = await fs.readFile(testOutputPath, "utf-8");
      expect(content).toContain("<language>fr-fr</language>");
    });

    test("should default language to en-us", async () => {
      const context = createMockContext(samplePosts);
      const tool = createGenerateRSSTool(context);

      await tool.handler(
        {
          outputPath: testOutputPath,
          siteUrl: "https://example.com",
          title: "My Blog",
          description: "Description",
        },
        mockToolContext,
      );

      const content = await fs.readFile(testOutputPath, "utf-8");
      expect(content).toContain("<language>en-us</language>");
    });

    test("should include copyright when provided", async () => {
      const context = createMockContext(samplePosts);
      const tool = createGenerateRSSTool(context);

      await tool.handler(
        {
          outputPath: testOutputPath,
          siteUrl: "https://example.com",
          title: "My Blog",
          description: "Description",
          copyright: "© 2025 My Blog",
        },
        mockToolContext,
      );

      const content = await fs.readFile(testOutputPath, "utf-8");
      expect(content).toContain("<copyright>© 2025 My Blog</copyright>");
    });

    test("should include managingEditor when provided", async () => {
      const context = createMockContext(samplePosts);
      const tool = createGenerateRSSTool(context);

      await tool.handler(
        {
          outputPath: testOutputPath,
          siteUrl: "https://example.com",
          title: "My Blog",
          description: "Description",
          managingEditor: "editor@example.com",
        },
        mockToolContext,
      );

      const content = await fs.readFile(testOutputPath, "utf-8");
      expect(content).toContain(
        "<managingEditor>editor@example.com</managingEditor>",
      );
    });

    test("should include webMaster when provided", async () => {
      const context = createMockContext(samplePosts);
      const tool = createGenerateRSSTool(context);

      await tool.handler(
        {
          outputPath: testOutputPath,
          siteUrl: "https://example.com",
          title: "My Blog",
          description: "Description",
          webMaster: "webmaster@example.com",
        },
        mockToolContext,
      );

      const content = await fs.readFile(testOutputPath, "utf-8");
      expect(content).toContain("<webMaster>webmaster@example.com</webMaster>");
    });
  });

  describe("error handling", () => {
    test("should validate required fields", async () => {
      const context = createMockContext(samplePosts);
      const tool = createGenerateRSSTool(context);

      // eslint-disable-next-line @typescript-eslint/await-thenable
      await expect(
        tool.handler(
          {
            // Missing required fields
          },
          mockToolContext,
        ),
      ).rejects.toThrow();
    });

    test("should validate URL format", async () => {
      const context = createMockContext(samplePosts);
      const tool = createGenerateRSSTool(context);

      // eslint-disable-next-line @typescript-eslint/await-thenable
      await expect(
        tool.handler(
          {
            outputPath: testOutputPath,
            siteUrl: "not-a-valid-url",
            title: "My Blog",
            description: "Description",
          },
          mockToolContext,
        ),
      ).rejects.toThrow();
    });

    test("should handle empty posts list", async () => {
      const context = createMockContext([]);
      const tool = createGenerateRSSTool(context);

      const result = await tool.handler(
        {
          outputPath: testOutputPath,
          siteUrl: "https://example.com",
          title: "My Blog",
          description: "Description",
        },
        mockToolContext,
      );

      expect(result.success).toBe(true);
      expect(result.message).toContain("0 posts");

      const content = await fs.readFile(testOutputPath, "utf-8");
      expect(content).toContain("<channel>");
      expect(content).not.toContain("<item>");
    });
  });

  describe("post links", () => {
    test("should generate correct post URLs", async () => {
      const context = createMockContext(samplePosts);
      const tool = createGenerateRSSTool(context);

      await tool.handler(
        {
          outputPath: testOutputPath,
          siteUrl: "https://myblog.com",
          title: "My Blog",
          description: "Description",
        },
        mockToolContext,
      );

      const content = await fs.readFile(testOutputPath, "utf-8");
      expect(content).toContain("https://myblog.com/posts/first-post");
      expect(content).toContain("https://myblog.com/posts/second-post");
    });

    test("should handle site URL without trailing slash", async () => {
      const context = createMockContext(samplePosts);
      const tool = createGenerateRSSTool(context);

      await tool.handler(
        {
          outputPath: testOutputPath,
          siteUrl: "https://example.com",
          title: "My Blog",
          description: "Description",
        },
        mockToolContext,
      );

      const content = await fs.readFile(testOutputPath, "utf-8");
      expect(content).toContain("https://example.com/posts/first-post");
    });
  });
});
