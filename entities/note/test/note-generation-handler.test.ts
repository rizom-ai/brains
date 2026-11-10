import { createTestEntity } from "@brains/entity-service/test";
import { createPluginHarness } from "@brains/plugins/test";
import { describe, it, expect, beforeEach, spyOn } from "bun:test";
import type { ContentGenerationConfig, JobHandler } from "@brains/plugins";
import { createMockProgressReporter } from "@brains/test-utils";
import type { Note } from "../src/schemas/note";
import { notePlugin } from "./note-plugin";

/** A job the notes queued for themselves, as the runtime queues it. */
function asPackage(input: unknown, entityId?: string): unknown {
  return {
    authority: {
      actor: { kind: "service", serviceId: "note" },
      permissionCeiling: "public",
    },
    input,
    byPackage: true,
    ...(entityId !== undefined && { entityId }),
  };
}

describe("the note generation", () => {
  let harness: ReturnType<typeof createPluginHarness>;
  let handler: JobHandler;
  let configs: ContentGenerationConfig[];
  let reply: unknown;

  beforeEach(async () => {
    harness = createPluginHarness();
    await harness.installPlugin(notePlugin());
    configs = [];
    reply = { title: "Neutral Note", body: "Body text" };
    harness.getMockShell().generateContent = async (
      config: ContentGenerationConfig,
    ): Promise<unknown> => {
      configs.push(config);
      return reply;
    };
    const registered = harness
      .getMockShell()
      .getJobQueueService()
      .getHandler("note:generation");
    if (!registered) throw new Error("No note generation");
    handler = registered;
  });

  function run(data: unknown): Promise<unknown> {
    return handler.process(
      handler.validateAndParse(data),
      "job-123",
      createMockProgressReporter(),
      new AbortController().signal,
    );
  }

  describe("validateAndParse", () => {
    it("should validate correct job data", () => {
      const data = { prompt: "Create a note about TypeScript" };
      expect(handler.validateAndParse(asPackage(data))).toMatchObject({
        input: data,
      });
    });

    it("should accept optional title", () => {
      const data = { prompt: "Create a note", title: "My Note" };
      expect(handler.validateAndParse(asPackage(data))).toMatchObject({
        input: data,
      });
    });

    it("should return null for missing required prompt", () => {
      expect(handler.validateAndParse(asPackage({}))).toBeNull();
      // As the note plugin class queued it, before the type was declared.
      expect(handler.validateAndParse({})).toBeNull();
    });
  });

  describe("process - entity creation", () => {
    it("classifies internal note generation as neutral", async () => {
      await run(asPackage({ prompt: "Write a note" }));

      expect(configs).toEqual([
        {
          prompt: "Write a note",
          templateName: "note:generation",
          representedIdentity: "none",
        },
      ]);
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
      await harness.getEntityService().createEntity({
        entity: createTestEntity<Note>("note", {
          id: "revised-community-launch",
          content: "",
          metadata: {
            title: "Revised Community Launch",
            status: "generating",
            titleStated: true,
          },
        }),
      });
      reply = { title: "Launch Decisions", body };
      const service = harness.getEntityService();
      const create = spyOn(service, "createEntity");
      const update = spyOn(service, "updateEntity");

      const result = await run(
        asPackage({ prompt }, "revised-community-launch"),
      );

      expect(result).toMatchObject({
        success: true,
        entityId: "revised-community-launch",
      });
      expect(configs).toEqual([
        {
          prompt,
          templateName: "note:generation",
          representedIdentity: "none",
        },
      ]);
      expect(create).not.toHaveBeenCalled();
      expect(update).toHaveBeenCalledTimes(1);
      const saved = update.mock.calls[0]?.[0].entity;
      expect(saved?.id).toBe("revised-community-launch");
      expect(saved?.content).toContain(body);
      expect(saved?.content).not.toContain("Monday");
      expect(saved?.content).not.toContain("Unassigned");
      expect(saved?.content).not.toContain("Draft the agenda");
      expect(saved?.content).not.toContain("status: generating");
      expect(saved?.metadata["status"]).toBeUndefined();
    });

    it("should slugify the title for the entity id and dedupe", async () => {
      reply = { title: "My Fancy Note!", body: "Body text" };
      const create = spyOn(harness.getEntityService(), "createEntity");

      const result = await run(asPackage({ prompt: "Write a note" }));

      expect(result).toMatchObject({ success: true });
      expect(create).toHaveBeenCalledWith({
        entity: expect.objectContaining({
          id: "my-fancy-note",
          metadata: expect.objectContaining({ title: "My Fancy Note!" }),
        }),
        options: { deduplicateId: true },
      });
    });

    it("should regenerate the title when the derived id collides", async () => {
      reply = { title: "Taken Title", body: "Body text" };
      await harness.getEntityService().createEntity({
        entity: createTestEntity<Note>("note", {
          id: "taken-title",
          content: "Existing note",
          metadata: { title: "Taken Title" },
        }),
      });
      // Parse the fixture through the caller's own schema: that produces a
      // genuine T for the generic, and fails loudly if the fixture drifts
      // from the shape the handler actually asks for.
      harness.getMockShell().generateObject = async <T>(
        _prompt: string,
        schema: { parse(value: unknown): T },
      ): Promise<{ object: T }> => ({
        object: schema.parse({ title: "Fresh Title" }),
      });
      const create = spyOn(harness.getEntityService(), "createEntity");

      const result = await run(asPackage({ prompt: "Write a note" }));

      expect(result).toMatchObject({ success: true });
      expect(create).toHaveBeenCalledWith({
        entity: expect.objectContaining({
          id: "fresh-title",
          metadata: expect.objectContaining({ title: "Fresh Title" }),
        }),
        options: { deduplicateId: true },
      });
    });
  });
});
