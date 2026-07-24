import { beforeEach, describe, expect, it, spyOn } from "bun:test";
import type { EntityPluginContext } from "@brains/plugins";
import { styleGuideAdapter, type StyleGuideEntity } from "@brains/style-guide";
import {
  createMockEntityPluginContext,
  createMockProgressReporter,
  createSilentLogger,
  createTestEntity,
} from "@brains/test-utils";
import { DeckGenerationJobHandler } from "../src/handlers/deckGenerationJobHandler";

describe("DeckGenerationJobHandler", () => {
  let handler: DeckGenerationJobHandler;
  let mockContext: EntityPluginContext;

  beforeEach(() => {
    mockContext = createMockEntityPluginContext({
      returns: {
        ai: {
          generate: {
            title: "Generated Deck",
            content: "# Opening\n\n---\n\n# Close",
            description: "Generated description",
          },
        },
        entityService: {
          getEntity: null,
          listEntities: [],
          createEntity: { entityId: "test-id" },
        },
      },
    });

    handler = new DeckGenerationJobHandler(
      createSilentLogger("test"),
      mockContext,
    );
  });

  describe("generation context", () => {
    it("passes anchor voice style guidance into deck generation", async () => {
      const styleEntity = createTestEntity<StyleGuideEntity>("style-guide", {
        id: "style-guide",
        content: styleGuideAdapter.createStyleGuideContent({
          name: "Deck voice",
          voice: { summary: "Decisive and evidence-led" },
        }),
        metadata: {},
      });
      const getEntity = spyOn(mockContext.entityService, "getEntity");
      getEntity.mockResolvedValueOnce(styleEntity).mockResolvedValueOnce(null);

      await handler.process(
        { prompt: "Create a deck about resilient systems" },
        "job-123",
        createMockProgressReporter(),
      );

      expect(mockContext.ai.generate).toHaveBeenCalledWith(
        expect.objectContaining({
          representedIdentity: "anchor",
          styleGuide: {
            voice: expect.stringContaining("Decisive and evidence-led"),
          },
        }),
      );
    });

    it("keeps source-style-preserving descriptions neutral", async () => {
      await handler.process(
        {
          title: "Existing Deck",
          content: "# Opinionated opening\n\n---\n\n# Conclusion",
        },
        "job-123",
        createMockProgressReporter(),
      );

      expect(mockContext.ai.generate).toHaveBeenCalledWith(
        expect.objectContaining({
          templateName: "decks:description",
          representedIdentity: "none",
        }),
      );
    });
  });

  describe("validateAndParse", () => {
    it("should validate correct job data", () => {
      const data = { prompt: "Create a presentation", title: "My Deck" };
      const result = handler.validateAndParse(data);

      expect(result).not.toBeNull();
      expect(result?.prompt).toBe("Create a presentation");
      expect(result?.title).toBe("My Deck");
    });

    it("should accept empty object (all fields optional)", () => {
      const result = handler.validateAndParse({});
      expect(result).not.toBeNull();
    });

    it("should return null for invalid data", () => {
      const result = handler.validateAndParse({ skipAi: "not-a-boolean" });
      expect(result).toBeNull();
    });
  });
});
