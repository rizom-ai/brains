import { describe, it, expect, beforeEach } from "bun:test";
import type {
  EntityGenerationResult,
  JobEntityAccess,
  JobHandlerContext,
} from "@brains/plugins";
import { parseMarkdownWithFrontmatter } from "@brains/plugins";
import {
  createMockEntityPluginContext,
  createMockProgressReporter,
  createSilentLogger,
  type MockEntityPluginContext,
} from "@brains/test-utils";
import {
  postGeneration,
  type BlogGenerationJobData,
} from "../src/handlers/blogGenerationJobHandler";
import { blogPostFrontmatterSchema } from "../src/schemas/blog-post";
import { createMockPost } from "./fixtures/blog-entities";

/**
 * These behaviours used to be asserted against BlogGenerationJobHandler,
 * which nothing in production constructed once the package became
 * declarative. They belong to `postGeneration`, which is what actually runs.
 */
describe("postGeneration", () => {
  const AI_POST = {
    title: "Generated Title",
    content: "Generated content",
    excerpt: "Generated excerpt",
  };

  let context: MockEntityPluginContext;
  let writes: number;

  function build(options: {
    aiReturns?: Record<string, unknown>;
    posts?: ReturnType<typeof createMockPost>[];
  }): void {
    writes = 0;
    context = createMockEntityPluginContext({
      returns: {
        ai: { generate: options.aiReturns ?? AI_POST },
        entityService: { getEntity: null, listEntities: options.posts ?? [] },
      },
    });
  }

  /**
   * Entity access that refuses to write: a generation returns content, and
   * the runtime is what persists it.
   */
  function entityAccess(): JobEntityAccess {
    const service = context.entityService;
    const refuseWrite = (): never => {
      writes += 1;
      throw new Error("postGeneration must not write the entity itself");
    };
    return {
      listEntities: (request) => service.listEntities(request),
      getEntity: (request) => service.getEntity(request),
      getEntityTypes: () => service.getEntityTypes(),
      search: (request) => service.search(request),
      get: async () => null,
      create: refuseWrite,
      update: refuseWrite,
      createPending: refuseWrite,
      saveProcessed: refuseWrite,
    };
  }

  async function generate(
    input: BlogGenerationJobData,
  ): Promise<EntityGenerationResult> {
    const jobContext: JobHandlerContext<BlogGenerationJobData> = {
      input,
      ai: context.ai,
      logger: createSilentLogger("blog-generation-test"),
      entities: entityAccess(),
      conversations: context.conversations,
      identity: context.identity,
      messaging: { publish: async (): Promise<void> => {} },
      progress: createMockProgressReporter(),
      signal: new AbortController().signal,
    };
    return postGeneration.generate({ ...jobContext, entityId: undefined });
  }

  function succeeded(
    result: EntityGenerationResult,
  ): Extract<EntityGenerationResult, { success: true }> {
    if (!result.success) throw new Error(`Generation failed: ${result.error}`);
    return result;
  }

  function frontmatterOf(
    result: EntityGenerationResult,
  ): ReturnType<typeof blogPostFrontmatterSchema.parse> {
    return parseMarkdownWithFrontmatter(
      succeeded(result).content,
      blogPostFrontmatterSchema,
    ).metadata;
  }

  beforeEach(() => {
    build({});
  });

  describe("what the AI is asked for", () => {
    it("generates title, content, and excerpt when given only a prompt", async () => {
      const result = await generate({ prompt: "Write about AI" });

      expect(succeeded(result).metadata["title"]).toBe("Generated Title");
      expect(frontmatterOf(result).excerpt).toBe("Generated excerpt");
      expect(context.ai.generate).toHaveBeenCalledWith(
        expect.objectContaining({
          prompt: expect.stringContaining("Write about AI"),
          templateName: "blog:generation",
        }),
      );
    });

    it("falls back to its own prompt when none is given", async () => {
      await generate({});

      expect(context.ai.generate).toHaveBeenCalledWith(
        expect.objectContaining({ templateName: "blog:generation" }),
      );
    });

    it("tells the AI which series a post belongs to", async () => {
      await generate({ prompt: "Write about AI", seriesName: "Foundations" });

      expect(context.ai.generate).toHaveBeenCalledWith(
        expect.objectContaining({
          prompt: expect.stringContaining("Foundations"),
        }),
      );
    });

    it("asks only for an excerpt when title and content are supplied", async () => {
      build({ aiReturns: { excerpt: "Generated excerpt" } });

      const result = await generate({
        title: "My Title",
        content: "My content",
      });

      expect(succeeded(result).metadata["title"]).toBe("My Title");
      expect(frontmatterOf(result).excerpt).toBe("Generated excerpt");
      expect(context.ai.generate).toHaveBeenCalledWith(
        expect.objectContaining({ templateName: "blog:excerpt" }),
      );
    });

    it("asks the AI for nothing when title, content, and excerpt are supplied", async () => {
      const result = await generate({
        title: "My Title",
        content: "My content",
        excerpt: "My excerpt",
      });

      expect(context.ai.generate).not.toHaveBeenCalled();
      expect(frontmatterOf(result).excerpt).toBe("My excerpt");
    });
  });

  describe("what it writes down", () => {
    const supplied = {
      title: "My Title",
      content: "Body",
      excerpt: "e",
    } as const;

    it("derives a slug from the title", async () => {
      const result = succeeded(await generate(supplied));

      expect(result.metadata["slug"]).toBe("my-title");
      expect(result.resultExtras?.["slug"]).toBe("my-title");
    });

    it("keeps a slug URL-safe when the title is not", async () => {
      const result = await generate({
        ...supplied,
        title: "C++ & Rust: A Comparison!",
      });

      expect(succeeded(result).metadata["slug"]).toBe("c-rust-a-comparison");
    });

    it("starts a post as a draft", async () => {
      expect(succeeded(await generate(supplied)).metadata["status"]).toBe(
        "draft",
      );
    });

    it("records the anchor profile as the author", async () => {
      const result = await generate(supplied);

      expect(frontmatterOf(result).author).toBe(
        context.identity.getProfile().name,
      );
    });

    it("carries a supplied cover image into the post", async () => {
      const result = await generate({ ...supplied, coverImageId: "image-1" });

      expect(frontmatterOf(result).coverImageId).toBe("image-1");
    });

    it("never writes the entity itself — the runtime does", async () => {
      await generate(supplied);

      expect(writes).toBe(0);
    });
  });

  describe("series placement", () => {
    const supplied = {
      title: "My Title",
      content: "Body",
      excerpt: "e",
    } as const;

    it("keeps an explicit series index", async () => {
      const result = succeeded(
        await generate({
          ...supplied,
          seriesName: "Foundations",
          seriesIndex: 4,
        }),
      );

      expect(result.metadata["seriesIndex"]).toBe(4);
      expect(result.metadata["seriesName"]).toBe("Foundations");
    });

    it("appends to the end of a series, counting only published posts", async () => {
      build({
        posts: [
          createMockPost("one", "One", "one", "published", {
            publishedAt: "2026-01-01",
            seriesName: "Foundations",
          }),
          createMockPost("two", "Two", "two", "published", {
            publishedAt: "2026-02-01",
            seriesName: "Foundations",
          }),
          // Unpublished, so it takes no place in the series.
          createMockPost("three", "Three", "three", "draft", {
            seriesName: "Foundations",
          }),
          // A different series.
          createMockPost("four", "Four", "four", "published", {
            publishedAt: "2026-03-01",
            seriesName: "Other",
          }),
        ],
      });

      const result = await generate({
        ...supplied,
        seriesName: "Foundations",
      });

      expect(succeeded(result).metadata["seriesIndex"]).toBe(3);
    });
  });

  describe("refusals", () => {
    // The runtime turns this into a failed entity rather than a thrown job.
    it("refuses a skeleton post with no title", async () => {
      expect(await generate({ skipAi: true })).toEqual({
        success: false,
        error: "Title is required when skipAi is true",
      });
    });

    it("writes a skeleton without asking the AI when skipAi is set", async () => {
      const result = await generate({ skipAi: true, title: "My Title" });

      expect(context.ai.generate).not.toHaveBeenCalled();
      expect(succeeded(result).metadata["title"]).toBe("My Title");
    });
  });
});
