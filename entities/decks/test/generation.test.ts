import { describe, it, expect, beforeEach, spyOn } from "bun:test";
import type {
  EntityGenerationResult,
  JobEntityAccess,
  JobHandlerContext,
} from "@brains/plugins";
import type { StyleGuideEntity } from "@brains/style-guide";
import {
  createMockEntityPluginContext,
  createMockProgressReporter,
  createSilentLogger,
  createTestEntity,
  type MockEntityPluginContext,
} from "@brains/test-utils";
import type { z } from "@brains/utils/zod";
import { deckGeneration } from "../src/handlers/deckGenerationJobHandler";

/**
 * These behaviours used to be asserted against DeckGenerationJobHandler,
 * which nothing in production constructed once the package became
 * declarative. They belong to `deckGeneration`, which is what runs.
 */
describe("deckGeneration", () => {
  let context: MockEntityPluginContext;
  let writes: number;

  function entityAccess(): JobEntityAccess {
    const service = context.entityService;
    const refuseWrite = (): never => {
      writes += 1;
      throw new Error("deckGeneration must not write the entity itself");
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
    input: z.output<typeof deckGeneration.input>,
  ): Promise<EntityGenerationResult> {
    const jobContext: JobHandlerContext<typeof input> = {
      input,
      ai: context.ai,
      logger: createSilentLogger("decks-generation-test"),
      entities: entityAccess(),
      conversations: context.conversations,
      identity: context.identity,
      messaging: { publish: async (): Promise<void> => {} },
      progress: createMockProgressReporter(),
      signal: new AbortController().signal,
    };
    return deckGeneration.generate({ ...jobContext, entityId: undefined });
  }

  function succeeded(
    result: EntityGenerationResult,
  ): Extract<EntityGenerationResult, { success: true }> {
    if (!result.success) throw new Error(`Generation failed: ${result.error}`);
    return result;
  }

  beforeEach(() => {
    writes = 0;
    context = createMockEntityPluginContext({
      returns: {
        ai: {
          generate: {
            title: "Generated Deck",
            content: "# One\n\n---\n\n# Two",
            description: "Generated description",
          },
        },
        entityService: { getEntity: null, listEntities: [] },
      },
    });
  });

  describe("generation context", () => {
    it("passes anchor voice style guidance into deck generation", async () => {
      const styleEntity = createTestEntity<StyleGuideEntity>("style-guide", {
        id: "style-guide",
        content: "",
        metadata: {
          name: "Deck voice",
          voice: { summary: "Decisive and evidence-led" },
        },
      });
      const getEntity = spyOn(context.entityService, "getEntity");
      getEntity.mockResolvedValueOnce(styleEntity).mockResolvedValueOnce(null);

      await generate({ prompt: "Create a deck about resilient systems" });

      expect(context.ai.generate).toHaveBeenCalledWith(
        expect.objectContaining({
          representedIdentity: "anchor",
          styleGuide: {
            voice: expect.stringContaining("Decisive and evidence-led"),
          },
        }),
      );
    });

    it("keeps source-style-preserving descriptions neutral", async () => {
      await generate({
        title: "Existing Deck",
        content: "# Opinionated opening\n\n---\n\n# Conclusion",
      });

      expect(context.ai.generate).toHaveBeenCalledWith(
        expect.objectContaining({
          templateName: "decks:description",
          representedIdentity: "none",
        }),
      );
    });
  });

  describe("what it writes down", () => {
    it("returns slide content and metadata for the runtime to persist", async () => {
      const result = succeeded(
        await generate({ prompt: "Create a deck about caching" }),
      );

      expect(result.metadata["title"]).toBe("Generated Deck");
      expect(result.metadata["slug"]).toBe("generated-deck");
      expect(result.metadata["status"]).toBe("draft");
      expect(result.content).toContain("---");
      expect(result.resultExtras?.["slug"]).toBe("generated-deck");
    });

    // Deck files are named after the entity id, so it stays the readable
    // title rather than becoming the slug.
    it("stores a deck under its title, not its slug", async () => {
      const result = succeeded(
        await generate({ prompt: "Create a deck about caching" }),
      );

      expect(result.id).toBe("Generated Deck");
      expect(result.metadata["slug"]).toBe("generated-deck");
    });

    it("refuses a skeleton deck with no title", async () => {
      expect(await generate({ skipAi: true })).toEqual({
        success: false,
        error: "Title is required when skipAi is true",
      });
    });

    it("never writes the entity itself — the runtime does", async () => {
      await generate({ prompt: "Create a deck about caching" });

      expect(writes).toBe(0);
    });
  });
});
