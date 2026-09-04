import { describe, it, expect, beforeEach, spyOn } from "bun:test";
import type { EntityGenerationResult, JobEntityAccess } from "@brains/plugins";
import {
  createMockEntityPluginContext,
  createSilentLogger,
  createTestEntityAccess,
  createTestJobContext,
  createTestEntity,
  type MockEntityPluginContext,
} from "@brains/test-utils";
import {
  socialPostGeneration,
  type GenerationJobData,
} from "../src/handlers/generationHandler";

/**
 * These behaviours used to be asserted against GenerationJobHandler. They
 * belong to `socialPostGeneration`, which returns content for the runtime
 * to persist.
 */
describe("socialPostGeneration", () => {
  let context: MockEntityPluginContext;
  let writes: number;

  function build(options: { aiReturns?: Record<string, unknown> } = {}): void {
    writes = 0;
    context = createMockEntityPluginContext({
      returns: {
        ai: {
          generate: options.aiReturns ?? {
            title: "Generated Post",
            content: "Generated body",
          },
        },
        entityService: { getEntity: null, listEntities: [] },
      },
    });
  }

  /**
   * A generation returns content and the runtime persists it, so writing its
   * own entity is a defect this catches rather than a case it supports.
   */
  function entityAccess(): JobEntityAccess {
    return createTestEntityAccess({
      entityService: context.entityService,
      refuseWrites: "socialPostGeneration must not write the entity itself",
      onWrite: () => {
        writes += 1;
      },
    });
  }

  async function generate(
    input: GenerationJobData,
  ): Promise<EntityGenerationResult> {
    const jobContext = createTestJobContext<GenerationJobData>({
      input,
      ai: context.ai,
      logger: createSilentLogger("social-generation-test"),
      entities: entityAccess(),
      conversations: context.conversations,
      identity: context.identity,
      template: (localName: string) =>
        `@brains/social-media:social-post:${localName}`,
    });
    return socialPostGeneration.generate({
      ...jobContext,
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

  describe("where the content comes from", () => {
    it("uses supplied content and title without asking the AI", async () => {
      const result = succeeded(
        await generate({ title: "My Post", content: "My body" }),
      );

      expect(context.ai.generate).not.toHaveBeenCalled();
      expect(result.metadata["title"]).toBe("My Post");
      expect(result.content).toContain("My body");
    });

    it("shapes supplied content that has no title", async () => {
      const result = succeeded(await generate({ content: "Raw thoughts" }));

      expect(context.ai.generate).toHaveBeenCalled();
      expect(result.metadata["title"]).toBe("Generated Post");
    });

    it("promotes a source entity", async () => {
      const source = createTestEntity("post", {
        id: "post-1",
        content: "The blog post body",
        metadata: { title: "A Post", slug: "a-post" },
      });
      // Only the source lookup finds anything: a getEntity that answers
      // everything would make the uniqueness check see a collision on every
      // candidate title.
      const getEntity = spyOn(context.entityService, "getEntity");
      getEntity.mockResolvedValueOnce(null).mockResolvedValueOnce(source);

      const result = succeeded(
        await generate({ sourceEntityType: "post", sourceEntityId: "post-1" }),
      );

      expect(result.metadata["title"]).toBe("Generated Post");
      expect(context.ai.generate).toHaveBeenCalledWith(
        expect.objectContaining({
          prompt: expect.stringContaining("The blog post body"),
        }),
        expect.anything(),
      );
    });

    it("refuses when the source entity is missing", async () => {
      const result = await generate({
        sourceEntityType: "post",
        sourceEntityId: "missing",
      });

      expect(result).toMatchObject({
        success: false,
        error: expect.stringContaining("not found"),
      });
    });

    it("refuses when nothing says what to write", async () => {
      expect(await generate({})).toMatchObject({
        success: false,
        error: expect.stringContaining("No content source"),
      });
    });
  });

  describe("what it writes down", () => {
    it("stores a post under a platform-prefixed slug", async () => {
      const result = succeeded(
        await generate({ title: "My Post", content: "Body" }),
      );

      expect(result.id).toBe("linkedin-my-post");
      expect(result.metadata["slug"]).toBe("linkedin-my-post");
      expect(result.resultExtras?.["slug"]).toBe("linkedin-my-post");
    });

    it("starts a post as a draft unless it is queued", async () => {
      expect(
        succeeded(await generate({ title: "My Post", content: "Body" }))
          .metadata["status"],
      ).toBe("draft");
      expect(
        succeeded(
          await generate({
            title: "My Post",
            content: "Body",
            addToQueue: true,
          }),
        ).metadata["status"],
      ).toBe("queued");
    });

    it("never writes the entity itself — the runtime does", async () => {
      await generate({ title: "My Post", content: "Body" });

      expect(writes).toBe(0);
    });
  });
});
