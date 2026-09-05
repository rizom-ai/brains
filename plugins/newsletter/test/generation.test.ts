import { beforeEach, describe, expect, it } from "bun:test";
import type { EntityGenerationResult, JobEntityAccess } from "@brains/plugins";
import { parseMarkdownWithFrontmatter } from "@brains/plugins";
import {
  createMockEntityPluginContext,
  createTestEntityAccess,
  createTestJobContext,
  type MockEntityPluginContext,
} from "@brains/plugins/test";
import { createTestEntity } from "@brains/entity-service/test";
import { createSilentLogger, stubMethod } from "@brains/test-utils";
import type { ProgressNotification } from "@brains/utils/progress";
import {
  generationJobSchema,
  newsletterGeneration,
  type GenerationJobData,
} from "../src/handlers/generation";
import { newsletterFrontmatterSchema } from "../src/schemas/newsletter";

const TEMPLATE = "@brains/newsletter:newsletter:generation";

function publishedPost(
  id: string,
  title: string,
  excerpt?: string,
): ReturnType<typeof createTestEntity> {
  return createTestEntity("post", {
    id,
    content: `# ${title}\n\nBody of ${title}`,
    metadata: {
      title,
      slug: id,
      status: "published",
      ...(excerpt === undefined ? {} : { excerpt }),
    },
  });
}

/**
 * The generation returns content for the runtime to persist; it never writes
 * the newsletter itself. These behaviours were asserted against the old job
 * handler class and belong to `newsletterGeneration` now.
 */
describe("newsletterGeneration", () => {
  let context: MockEntityPluginContext;
  let progress: Array<{ progress: number; message?: string | undefined }>;

  function build(
    options: {
      aiReturns?: Record<string, unknown>;
      posts?: ReturnType<typeof createTestEntity>[];
    } = {},
  ): void {
    progress = [];
    const posts = options.posts ?? [];
    context = createMockEntityPluginContext({
      returns: {
        ai: {
          generate: options.aiReturns ?? {
            subject: "Generated Subject",
            content: "Generated body",
          },
        },
        entityService: { getEntity: null, listEntities: [] },
      },
    });
    // Source posts are read one by one; answer each from the seeded list.
    stubMethod(
      context.entityService,
      "getEntity",
      async (request: { entityType: string; id: string }) =>
        posts.find(
          (post) =>
            post.id === request.id && post.entityType === request.entityType,
        ) ?? null,
    );
  }

  function entityAccess(): JobEntityAccess {
    return createTestEntityAccess({
      entityService: context.entityService,
      refuseWrites: "newsletterGeneration must not write the entity itself",
    });
  }

  async function generate(
    input: GenerationJobData,
  ): Promise<EntityGenerationResult> {
    const jobContext = createTestJobContext<GenerationJobData>({
      input,
      ai: context.ai,
      logger: createSilentLogger("newsletter-generation-test"),
      entities: entityAccess(),
      conversations: context.conversations,
      identity: context.identity,
      template: (localName: string) =>
        `@brains/newsletter:newsletter:${localName}`,
    });
    return newsletterGeneration.generate({
      ...jobContext,
      progress: {
        report: async (notification: ProgressNotification): Promise<void> => {
          progress.push({
            progress: notification.progress,
            message: notification.message,
          });
        },
      },
      entityId: undefined,
    });
  }

  function succeeded(
    result: EntityGenerationResult,
  ): Extract<EntityGenerationResult, { success: true }> {
    if (!result.success) throw new Error(`Generation failed: ${result.error}`);
    return result;
  }

  beforeEach(() => {
    build();
  });

  describe("generationJobSchema", () => {
    it("accepts a prompt, direct content, or source posts", () => {
      expect(
        generationJobSchema.safeParse({ prompt: "About AI" }).success,
      ).toBe(true);
      expect(
        generationJobSchema.safeParse({ subject: "Weekly", content: "Hello" })
          .success,
      ).toBe(true);
      expect(
        generationJobSchema.safeParse({
          sourceEntityIds: ["post-1"],
          sourceEntityType: "post",
        }).success,
      ).toBe(true);
    });

    it("rejects a source type it cannot write from", () => {
      expect(
        generationJobSchema.safeParse({
          sourceEntityIds: ["post-1"],
          sourceEntityType: "deck",
        }).success,
      ).toBe(false);
    });
  });

  describe("where the content comes from", () => {
    it("uses direct content and subject without asking the AI", async () => {
      const result = succeeded(
        await generate({ subject: "Weekly Update", content: "Hello all" }),
      );

      expect(context.ai.generate).not.toHaveBeenCalled();
      const { content, metadata } = parseMarkdownWithFrontmatter(
        result.content,
        newsletterFrontmatterSchema,
      );
      expect(content.trim()).toBe("Hello all");
      expect(metadata).toMatchObject({
        subject: "Weekly Update",
        status: "draft",
      });
      expect(result.id).toBe("weekly-update");
    });

    it("refuses direct content without a subject", async () => {
      const result = await generate({ content: "Hello all" });

      expect(result).toEqual({
        success: false,
        error: "Subject is required when providing content directly",
      });
    });

    it("writes from the source posts in the anchor's voice", async () => {
      build({
        posts: [
          publishedPost("post-1", "First Post", "First excerpt"),
          publishedPost("post-2", "Second Post"),
        ],
      });

      const result = succeeded(
        await generate({
          sourceEntityIds: ["post-1", "post-2"],
          sourceEntityType: "post",
        }),
      );

      expect(context.ai.generate).toHaveBeenCalledTimes(1);
      expect(context.ai.generate).toHaveBeenCalledWith(
        expect.objectContaining({
          templateName: TEMPLATE,
          representedIdentity: "anchor",
          prompt: expect.stringMatching(
            /## First Post[\s\S]*First excerpt[\s\S]*## Second Post/,
          ),
        }),
        expect.anything(),
      );
      expect(result.metadata).toMatchObject({
        subject: "Generated Subject",
        entityIds: ["post-1", "post-2"],
        sourceEntityType: "post",
      });
    });

    it("fails when none of the source posts exist", async () => {
      const result = await generate({
        sourceEntityIds: ["missing-1", "missing-2"],
        sourceEntityType: "post",
      });

      expect(result).toEqual({
        success: false,
        error: "No source entities found for IDs: missing-1, missing-2",
      });
    });

    it("writes from a bare prompt", async () => {
      const result = succeeded(await generate({ prompt: "Write about tides" }));

      expect(context.ai.generate).toHaveBeenCalledTimes(1);
      expect(context.ai.generate).toHaveBeenCalledWith(
        expect.objectContaining({
          prompt: "Write about tides",
          templateName: TEMPLATE,
        }),
        expect.anything(),
      );
      expect(result.metadata).toMatchObject({
        subject: "Generated Subject",
        status: "draft",
      });
    });

    it("fails when there is nothing to write from", async () => {
      const result = await generate({});

      expect(result).toEqual({
        success: false,
        error:
          "No content source provided (prompt, sourceEntityIds, or content)",
      });
    });
  });

  describe("what it hands back", () => {
    it("queues the issue when asked to", async () => {
      const result = succeeded(
        await generate({ prompt: "Write", addToQueue: true }),
      );

      expect(result.metadata).toMatchObject({ status: "queued" });
    });

    it("keeps the subject the caller gave over the one the AI proposed", async () => {
      const result = succeeded(
        await generate({ prompt: "Write", subject: "My Subject" }),
      );

      expect(result.metadata).toMatchObject({ subject: "My Subject" });
      expect(result.id).toBe("my-subject");
    });

    it("reports progress while it works", async () => {
      await generate({ prompt: "Write" });

      expect(progress.map(({ progress }) => progress)).toEqual([10, 50]);
    });
  });
});
