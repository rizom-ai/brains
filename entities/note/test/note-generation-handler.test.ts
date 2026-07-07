import { describe, it, expect, beforeEach, spyOn } from "bun:test";
import type { EntityPluginContext } from "@brains/plugins";
import type { ProgressReporter } from "@brains/utils/progress";
import { NoteGenerationJobHandler } from "../src/handlers/noteGenerationJobHandler";
import {
  createSilentLogger,
  createMockEntityPluginContext,
  createMockProgressReporter,
  createTestEntity,
} from "@brains/test-utils";
import type { Note } from "../src/schemas/note";

describe("NoteGenerationJobHandler", () => {
  let handler: NoteGenerationJobHandler;
  let mockContext: EntityPluginContext;
  let mockProgressReporter: ProgressReporter;

  beforeEach(() => {
    mockProgressReporter = createMockProgressReporter();
    mockContext = createMockEntityPluginContext({
      returns: {
        entityService: {
          getEntity: null,
          listEntities: [],
          createEntity: { entityId: "test-id" },
        },
      },
    });

    handler = new NoteGenerationJobHandler(
      createSilentLogger("test"),
      mockContext,
    );
  });

  describe("validateAndParse", () => {
    it("should validate correct job data", () => {
      const data = { prompt: "Create a note about TypeScript" };
      const result = handler.validateAndParse(data);

      expect(result).not.toBeNull();
      expect(result?.prompt).toBe("Create a note about TypeScript");
    });

    it("should accept optional title", () => {
      const data = { prompt: "Create a note", title: "My Note" };
      const result = handler.validateAndParse(data);

      expect(result).not.toBeNull();
      expect(result?.title).toBe("My Note");
    });

    it("should return null for missing required prompt", () => {
      const result = handler.validateAndParse({});
      expect(result).toBeNull();
    });
  });

  describe("process - entity creation", () => {
    it("should slugify the title for the entity id and dedupe", async () => {
      spyOn(mockContext.ai, "generate").mockResolvedValue({
        title: "My Fancy Note!",
        body: "Body text",
      });

      const result = await handler.process(
        { prompt: "Write a note" },
        "job-123",
        mockProgressReporter,
      );

      expect(result.success).toBe(true);
      expect(mockContext.entityService.createEntity).toHaveBeenCalledWith({
        entity: expect.objectContaining({
          id: "my-fancy-note",
          metadata: expect.objectContaining({ title: "My Fancy Note!" }),
        }),
        options: { deduplicateId: true },
      });
    });

    it("should regenerate the title when the derived id collides", async () => {
      spyOn(mockContext.ai, "generate").mockResolvedValue({
        title: "Taken Title",
        body: "Body text",
      });
      spyOn(mockContext.entityService, "getEntity").mockResolvedValue(
        createTestEntity<Note>("note", {
          id: "taken-title",
          content: "Existing note",
          metadata: { title: "Taken Title" },
        }),
      );
      spyOn(mockContext.ai, "generateObject").mockResolvedValue({
        object: { title: "Fresh Title" },
      } as Awaited<ReturnType<typeof mockContext.ai.generateObject>>);

      const result = await handler.process(
        { prompt: "Write a note" },
        "job-123",
        mockProgressReporter,
      );

      expect(result.success).toBe(true);
      expect(mockContext.entityService.createEntity).toHaveBeenCalledWith({
        entity: expect.objectContaining({
          id: "fresh-title",
          metadata: expect.objectContaining({ title: "Fresh Title" }),
        }),
        options: { deduplicateId: true },
      });
    });
  });
});
