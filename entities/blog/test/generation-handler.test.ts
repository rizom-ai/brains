import { createTestEntity } from "@brains/entity-service/test";
import { createPluginHarness } from "@brains/plugins/test";
import { beforeEach, describe, expect, it } from "bun:test";
import type { ContentGenerationConfig, JobHandler } from "@brains/plugins";
import type { StyleGuideEntity } from "@brains/style-guide";
import { createMockProgressReporter } from "@brains/test-utils";
import { blogPlugin } from "./blog-plugin";
import { createMockPost } from "./fixtures/blog-entities";

/** A job the blog queued for itself, as the runtime queues it. */
function asPackage(input: unknown): unknown {
  return {
    authority: {
      actor: { kind: "service", serviceId: "blog" },
      permissionCeiling: "public",
    },
    input,
    byPackage: true,
  };
}

describe("the post generation", () => {
  let harness: ReturnType<typeof createPluginHarness>;
  let handler: JobHandler;
  let configs: ContentGenerationConfig[];
  let failGeneration: boolean;

  beforeEach(async () => {
    harness = createPluginHarness();
    await harness.installPlugin(blogPlugin());
    configs = [];
    failGeneration = false;
    harness.getMockShell().generateContent = async (
      config: ContentGenerationConfig,
    ): Promise<unknown> => {
      configs.push(config);
      if (failGeneration) throw new Error("AI generation failed");
      return config.templateName === "blog:excerpt"
        ? { excerpt: "Generated excerpt" }
        : {
            title: "Generated Title",
            content: "Generated content",
            excerpt: "Generated excerpt",
          };
    };
    const registered = harness
      .getMockShell()
      .getJobQueueService()
      .getHandler("post:generation");
    if (!registered) throw new Error("No post generation");
    handler = registered;
    // As the declared style guide reads: the guidance is its metadata.
    harness.getMockShell().addEntities([
      createTestEntity<StyleGuideEntity>("style-guide", {
        id: "style-guide",
        content: "",
        metadata: { name: "Blog voice", voice: { summary: "Warm and exact" } },
      }),
    ]);
  });

  async function run(input: unknown): Promise<unknown> {
    return handler.process(
      handler.validateAndParse(asPackage(input)),
      "job-123",
      createMockProgressReporter(),
      new AbortController().signal,
    );
  }

  async function stored(id: string): Promise<Record<string, unknown>> {
    const post = await harness.getEntityService().getEntity({
      entityType: "post",
      id,
      visibilityScope: "restricted",
    });
    if (!post) throw new Error(`No post ${id}`);
    return { content: post.content, ...post.metadata };
  }

  describe("validateAndParse", () => {
    it("takes every field optional, and the raw shape the class queued", () => {
      expect(handler.validateAndParse(asPackage({}))).not.toBeNull();
      expect(
        handler.validateAndParse({
          prompt: "Write about TypeScript",
          title: "TypeScript Tips",
          seriesName: "Dev Tips",
          seriesIndex: 1,
        }),
      ).not.toBeNull();
    });

    it("refuses data of the wrong type", () => {
      expect(
        handler.validateAndParse(asPackage({ seriesIndex: "one" })),
      ).toBeNull();
    });

    it("keeps the source reference", () => {
      expect(
        handler.validateAndParse(
          asPackage({
            prompt: "A post from my note",
            sourceEntityType: "note",
            sourceEntityIds: ["on-slowness"],
          }),
        ),
      ).toMatchObject({
        input: { sourceEntityType: "note", sourceEntityIds: ["on-slowness"] },
      });
    });
  });

  describe("AI generates everything", () => {
    it("writes the title, body and excerpt as the anchor, in the brain's voice", async () => {
      const result = await run({ prompt: "Write about TypeScript" });
      expect(result).toEqual({
        success: true,
        entityId: "Generated Title",
        title: "Generated Title",
        slug: "generated-title",
      });
      expect(configs).toEqual([
        expect.objectContaining({
          prompt: "Write about TypeScript",
          templateName: "blog:generation",
          representedIdentity: "anchor",
          styleGuide: { voice: expect.stringContaining("Warm and exact") },
        }),
      ]);
      // Titled for a human-readable file; the slug is the URL.
      expect(await stored("Generated Title")).toMatchObject({
        content: "Generated content",
        title: "Generated Title",
        slug: "generated-title",
        status: "draft",
        excerpt: "Generated excerpt",
        author: "Test Owner",
      });
    });

    it("uses the default prompt when none is given", async () => {
      await run({});
      expect(configs[0]?.prompt).toBe(
        "Write an insightful blog post about a topic from my knowledge base that would be valuable to share",
      );
    });

    it("names the series in the prompt", async () => {
      await run({ prompt: "Part one", seriesName: "Dev Tips" });
      expect(configs[0]?.prompt).toBe(
        'Part one\n\nNote: This is part of a series called "Dev Tips".',
      );
    });
  });

  describe("AI writes the excerpt only", () => {
    it("writes an excerpt for a given title and body, without the anchor", async () => {
      await run({ title: "Given", content: "Given body." });
      expect(configs).toEqual([
        expect.objectContaining({
          prompt: "Title: Given\n\nContent:\nGiven body.",
          templateName: "blog:excerpt",
          representedIdentity: "none",
          styleGuide: { voice: expect.stringContaining("Warm and exact") },
        }),
      ]);
      expect(await stored("Given")).toMatchObject({
        content: "Given body.",
        excerpt: "Generated excerpt",
      });
    });
  });

  describe("the user provides everything", () => {
    it("saves it without asking the AI", async () => {
      expect(
        await run({
          title: "All Given",
          content: "All body.",
          excerpt: "All ex.",
          author: "Sam",
          coverImageId: "cov",
        }),
      ).toMatchObject({ success: true, slug: "all-given" });
      expect(configs).toEqual([]);
      expect(await stored("All Given")).toMatchObject({
        excerpt: "All ex.",
        author: "Sam",
        coverImageId: "cov",
        status: "draft",
      });
    });

    it("keeps an essay published elsewhere: its status, date and address", async () => {
      await run({
        title: "Elsewhere",
        content: "Body.",
        excerpt: "E.",
        status: "published",
        publishedAt: "2025-03-12T00:00:00.000Z",
        canonicalUrl: "https://example.substack.com/p/elsewhere",
      });
      expect(await stored("Elsewhere")).toMatchObject({
        status: "published",
        publishedAt: "2025-03-12T00:00:00.000Z",
        canonicalUrl: "https://example.substack.com/p/elsewhere",
      });
    });

    it("dates a post created as published without a date", async () => {
      await run({
        title: "Now",
        content: "Body.",
        excerpt: "E.",
        status: "published",
      });
      expect(typeof (await stored("Now"))["publishedAt"]).toBe("string");
    });

    it("writes a skeleton without the AI", async () => {
      await run({ title: "Skeleton Post", skipAi: true });
      expect(configs).toEqual([]);
      expect(await stored("Skeleton Post")).toMatchObject({
        excerpt: "Blog post about Skeleton Post",
        content: expect.stringContaining("## Introduction"),
      });
    });

    it("refuses a skeleton without a title", async () => {
      expect(await run({ skipAi: true })).toEqual({
        success: false,
        error: "Title is required when skipAi is true",
      });
    });
  });

  describe("series", () => {
    it("places a post after the published posts already in its series", async () => {
      harness.getMockShell().addEntities([
        createMockPost("one", "One", "one", "published", {
          publishedAt: "2025-01-01T00:00:00.000Z",
          seriesName: "Dev Tips",
          seriesIndex: 1,
        }),
        createMockPost("draft", "Draft", "draft", "draft", {
          seriesName: "Dev Tips",
        }),
      ]);
      await run({
        title: "Two",
        content: "Body.",
        excerpt: "E.",
        seriesName: "Dev Tips",
      });
      expect(await stored("Two")).toMatchObject({
        seriesName: "Dev Tips",
        seriesIndex: 2,
      });
    });

    it("keeps a given series index", async () => {
      await run({
        title: "Three",
        content: "Body.",
        excerpt: "E.",
        seriesName: "Dev Tips",
        seriesIndex: 3,
      });
      expect(await stored("Three")).toMatchObject({ seriesIndex: 3 });
    });
  });

  describe("from a source entity", () => {
    it("writes the post from the source text", async () => {
      harness.getMockShell().addEntities([
        createTestEntity("note", {
          id: "on-slowness",
          content: "Slowness is a craft, not a delay.",
          metadata: { title: "On slowness" },
        }),
      ]);
      await run({
        prompt: "Turn this note into a post",
        sourceEntityType: "note",
        sourceEntityIds: ["on-slowness"],
      });
      expect(configs[0]?.prompt).toBe(
        "Turn this note into a post\n\nWrite the post from this source material:\n\n## On slowness\n\nSlowness is a craft, not a delay.",
      );
    });

    it("fails when the source is gone, before asking the AI", async () => {
      const result = await run({
        prompt: "Turn this note into a post",
        sourceEntityType: "note",
        sourceEntityIds: ["missing"],
      });
      expect(result).toEqual({
        success: false,
        error: "Source not found: note/missing",
      });
      expect(configs).toEqual([]);
    });
  });

  it("answers with the error when the AI fails", async () => {
    failGeneration = true;
    expect(await run({ prompt: "x" })).toEqual({
      success: false,
      error: "AI generation failed",
    });
  });
});
