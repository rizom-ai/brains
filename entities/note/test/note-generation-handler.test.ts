import { createTestEntity } from "@brains/entity-service/test";
import { createMockEntityPluginContext } from "@brains/plugins/test";
import { describe, it, expect, beforeEach, spyOn } from "bun:test";
import type { EntityPluginContext } from "@brains/plugins";
import type { ProgressReporter } from "@brains/utils/progress";
import {
  NoteGenerationJobHandler,
  generatedNoteSchema,
} from "../src/handlers/noteGenerationJobHandler";
import {
  createSilentLogger,
  createMockProgressReporter,
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
          createEntity: {
            entityId: "test-id",
            jobId: "mock-job-id",
            skipped: false,
          },
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
    it("classifies internal note generation as neutral", async () => {
      spyOn(mockContext.ai, "generate").mockResolvedValue({
        title: "Neutral Note",
        body: "Body text",
      });

      await handler.process(
        { prompt: "Write a note" },
        "job-123",
        mockProgressReporter,
      );

      expect(mockContext.ai.generate).toHaveBeenCalledWith(
        {
          prompt: "Write a note",
          templateName: "note:generation",
          representedIdentity: "none",
        },
        generatedNoteSchema,
      );
    });

    it("replaces a queued rewrite stub with the generated body, not the source or progress text", async () => {
      const prompt = [
        "Rewrite this upload with Decisions and Next steps sections.",
        "Change Monday to Friday, set the owner to Mira, and replace the next step with Publish the participant checklist.",
        "Source: Launch day: Monday. Owner: Unassigned. Next step: Draft the agenda.",
      ].join("\n");
      const body = [
        "## Decisions",
        "- Launch day: Friday.",
        "- Owner: Mira.",
        "",
        "## Next steps",
        "- Publish the participant checklist.",
      ].join("\n");
      const stub = createTestEntity<Note>("note", {
        id: "revised-community-launch",
        content:
          "---\ntitle: Revised Community Launch\nstatus: generating\n---\n",
        metadata: { title: "Revised Community Launch", status: "generating" },
      });
      spyOn(mockContext.ai, "generate").mockResolvedValue({
        title: "Launch Decisions",
        body,
      });
      spyOn(mockContext.entityService, "getEntity").mockImplementation(
        async ({ id }: { id: string }) => (id === stub.id ? stub : null),
      );
      const update = spyOn(
        mockContext.entityService,
        "updateEntity",
      ).mockResolvedValue({
        entityId: stub.id,
        jobId: "saved-note-job",
        skipped: false,
      });
      const parsed = handler.validateAndParse({ entityId: stub.id, prompt });
      if (!parsed) throw new Error("Expected valid queued rewrite data");
      expect(parsed).toMatchObject({ entityId: stub.id, prompt });

      const result = await handler.process(
        parsed,
        "rewrite-job",
        mockProgressReporter,
      );

      expect(result).toMatchObject({ success: true, entityId: stub.id });
      expect(mockContext.ai.generate).toHaveBeenCalledWith(
        {
          prompt,
          templateName: "note:generation",
          representedIdentity: "none",
        },
        generatedNoteSchema,
      );
      expect(mockContext.entityService.createEntity).not.toHaveBeenCalled();
      expect(update).toHaveBeenCalledTimes(1);
      const saved = update.mock.calls[0]?.[0].entity;
      expect(saved?.id).toBe(stub.id);
      expect(saved?.content).toContain(body);
      expect(saved?.content).not.toContain("Monday");
      expect(saved?.content).not.toContain("Unassigned");
      expect(saved?.content).not.toContain("Draft the agenda");
      expect(saved?.content).not.toContain("status: generating");
      expect(saved?.metadata["status"]).toBeUndefined();
    });

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
      // Parse the fixture through the caller's own schema: that produces a
      // genuine T for the generic, and fails loudly if the fixture drifts
      // from the shape the handler actually asks for.
      spyOn(mockContext.ai, "generateObject").mockImplementation(
        async (_prompt, schema) => ({
          object: schema.parse({ title: "Fresh Title" }),
        }),
      );

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
