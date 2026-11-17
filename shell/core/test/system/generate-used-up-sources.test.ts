import { describe, expect, it } from "bun:test";
import { expectConfirmationArgs } from "@brains/mcp-service/test";
import type { BaseEntity, EntityTypeConfig } from "@brains/entity-service";
import type { ToolContext, ToolResponse } from "@brains/mcp-service";
import { PermissionService, type UserPermissionLevel } from "@brains/templates";
import { z } from "@brains/utils/zod";
import { createSystemTools } from "../../src/system/tools";
import { generateInputSchema } from "../../src/system/schemas";
import { createMockSystemServices } from "./mock-services";

type MockServices = ReturnType<typeof createMockSystemServices>;

function seeded(
  id: string,
  entityType: string,
  title: string,
  visibility: BaseEntity["visibility"] = "public",
): BaseEntity {
  return {
    id,
    entityType,
    content: `About ${title}`,
    contentHash: id,
    visibility,
    metadata: { title },
    created: "2026-01-01T00:00:00.000Z",
    updated: "2026-01-01T00:00:00.000Z",
  };
}

/** A brain whose `refined-note` generation uses up the notes it is written from. */
function setup(permissions: PermissionService = new PermissionService({})): {
  services: MockServices;
  generate: (
    input: Record<string, unknown>,
    level?: UserPermissionLevel,
  ) => Promise<ToolResponse>;
} {
  const services = createMockSystemServices({ permissionService: permissions });
  services.registerEntityTypes(["note", "refined-note", "post", "newsletter"]);
  services.addEntities([
    seeded("loose-thought", "note", "Loose thought"),
    seeded("second-thought", "note", "Second thought"),
    seeded("an-essay", "post", "An essay"),
  ]);
  services.entityRegistry.getEntityTypeConfig = (
    type: string,
  ): EntityTypeConfig =>
    type === "refined-note" ? { consumesSources: ["note"] } : {};
  const tool = createSystemTools(services).find(
    ({ name }) => name === "system_generate",
  );
  if (!tool) throw new Error("system_generate not found");
  return {
    services,
    generate: (input, level = "admin"): Promise<ToolResponse> => {
      const context: ToolContext = {
        interfaceType: "mcp",
        actor: { kind: "user", userId: "tester" },
        userPermissionLevel: level,
      };
      return tool.handler(input, context);
    },
  };
}

const refine = (
  source: { entityType: string; entityId: string },
  prompt?: string,
): Record<string, unknown> => ({
  operation: {
    kind: "prompt-from-source",
    entityType: "refined-note",
    source,
    ...(prompt !== undefined && { prompt }),
  },
});

const jobData = (services: MockServices): Record<string, unknown> => {
  const job = services.getLastEnqueuedJob();
  if (!job) throw new Error("No job was enqueued");
  return z.record(z.string(), z.unknown()).parse(job.data);
};

describe("system_generate from a source, without a prompt", () => {
  it("accepts an operation that states no prompt", () => {
    expect(
      generateInputSchema.safeParse({
        operation: {
          kind: "prompt-from-source",
          entityType: "newsletter",
          source: { entityType: "post", entityId: "an-essay" },
        },
      }).success,
    ).toBe(true);
    // A generation with no source still needs to be told what to write.
    expect(
      generateInputSchema.safeParse({
        operation: { kind: "prompt", entityType: "newsletter" },
      }).success,
    ).toBe(false);
  });

  it("writes from the source alone, under the source's id", async () => {
    const { services, generate } = setup();

    const confirmation = await generate({
      operation: {
        kind: "prompt-from-source",
        entityType: "newsletter",
        source: { entityType: "post", entityId: "an-essay" },
      },
    });
    const result = await generate(expectConfirmationArgs(confirmation));

    expect(result).toMatchObject({
      success: true,
      data: { entityId: "an-essay", status: "generating" },
    });
    expect(jobData(services)).toMatchObject({
      entityId: "an-essay",
      prompt: 'Write a newsletter from "An essay".',
      sourceEntityType: "post",
      sourceEntityIds: ["an-essay"],
    });
    // A source another type keeps is never removed.
    expect(services.getEntities().has("an-essay")).toBe(true);
  });

  // A plain note's title is its first line, which makes a poor id; the id
  // it was saved under is the name its owner gave it.
  it("takes the id from the source's id, not from a title its text supplies", async () => {
    const { services, generate } = setup();
    services.addEntities([
      seeded(
        "dashboard-drop-off",
        "note",
        "Onboarding call with Mira. She stopped opening the dashboard after week 1",
      ),
    ]);

    const confirmation = await generate(
      refine({ entityType: "note", entityId: "dashboard-drop-off" }),
    );
    const result = await generate(expectConfirmationArgs(confirmation));

    expect(result).toMatchObject({
      success: true,
      data: { entityId: "dashboard-drop-off" },
    });
  });

  it("keeps the direction a caller gives", async () => {
    const { services, generate } = setup();

    const confirmation = await generate(
      refine(
        { entityType: "note", entityId: "loose-thought" },
        "Focus on the budget",
      ),
    );
    await generate(expectConfirmationArgs(confirmation));

    expect(jobData(services)).toMatchObject({ prompt: "Focus on the budget" });
  });
});

describe("system_generate for a type that uses up its sources", () => {
  it("says in its confirmation that the source will be removed", async () => {
    const { services, generate } = setup();

    const confirmation = await generate(
      refine({ entityType: "note", entityId: "Loose thought" }),
    );

    expect(confirmation).toMatchObject({
      needsConfirmation: true,
      summary:
        'Generate refined-note from "Loose thought"? It will be removed.',
      // What is reported once the caller confirms: the generation is
      // queued, and the source goes when what it writes is saved.
      completionSummary:
        'Generating refined-note from "Loose thought", which will be removed once it is saved.',
      preview: "Entity type: refined-note\nRemoves: note/loose-thought",
    });
    // Nothing is written or removed before the caller confirms.
    expect(services.getLastEnqueuedJob()).toBeUndefined();
    expect(services.getEntities().has("loose-thought")).toBe(true);
  });

  it("queues the generation with its source once confirmed", async () => {
    const { services, generate } = setup();

    const confirmation = await generate(
      refine({ entityType: "note", entityId: "loose-thought" }),
    );
    const result = await generate(expectConfirmationArgs(confirmation));

    expect(result).toMatchObject({ success: true });
    expect(services.getLastEnqueuedJob()?.type).toBe("refined-note:generation");
    expect(jobData(services)).toMatchObject({
      sourceEntityType: "note",
      sourceEntityIds: ["loose-thought"],
    });
  });

  it("gives a caller who may not delete the source the delete permission error", async () => {
    const { services, generate } = setup(
      new PermissionService({ entityActions: { note: { delete: "admin" } } }),
    );

    const result = await generate(
      refine({ entityType: "note", entityId: "loose-thought" }),
      "trusted",
    );

    expect(result).toEqual({
      success: false,
      error:
        "Deleting `note` requires Admin permission; your current permission is Trusted.",
    });
    expect(services.getLastEnqueuedJob()).toBeUndefined();
  });

  it("answers not found for a source the caller cannot see", async () => {
    const { services, generate } = setup();
    services.addEntities([
      seeded("private-thought", "note", "Private thought", "restricted"),
    ]);

    const result = await generate(
      refine({ entityType: "note", entityId: "private-thought" }),
      "trusted",
    );

    expect(result).toMatchObject({
      success: false,
      code: "source-not-found",
    });
    expect(JSON.stringify(result)).not.toContain("Private thought");
  });

  it("refuses a source of a type it does not use up", async () => {
    const { generate } = setup();

    const result = await generate(
      refine({ entityType: "post", entityId: "an-essay" }),
    );

    expect(result).toEqual({
      success: false,
      error:
        "A refined-note is written from note entries, and 'post' is not one of them.",
      code: "unsupported-generation",
    });
  });

  it("refuses to write one from a prompt alone", async () => {
    const { generate } = setup();

    const result = await generate({
      operation: {
        kind: "prompt",
        entityType: "refined-note",
        prompt: "Something about budgets",
      },
    });

    expect(result).toEqual({
      success: false,
      error:
        "A refined-note is written from note entries. Use operation.kind prompt-from-source and name the source.",
      code: "unsupported-generation",
    });
  });
});

describe("system_generate from several sources", () => {
  const several = (
    entityType: string,
    source: { entityType: string; entityId: string },
    additionalSourceIds: string[],
  ): Record<string, unknown> => ({
    operation: {
      kind: "prompt-from-source",
      entityType,
      source,
      additionalSourceIds,
    },
  });

  it("names every source in one confirmation and says they will be removed", async () => {
    const { services, generate } = setup();
    services.addEntities([seeded("third-thought", "note", "Third thought")]);

    const confirmation = await generate(
      several(
        "refined-note",
        { entityType: "note", entityId: "Loose thought" },
        ["Second thought", "third-thought"],
      ),
    );

    expect(confirmation).toMatchObject({
      needsConfirmation: true,
      summary:
        'Generate refined-note from "Loose thought", "Second thought" and "Third thought"? They will be removed.',
    });
    expect(confirmation).toMatchObject({
      preview: [
        "Entity type: refined-note",
        "Removes: note/loose-thought",
        "Removes: note/second-thought",
        "Removes: note/third-thought",
      ].join("\n"),
    });
    // The confirmed call names the sources as they were resolved.
    expect(expectConfirmationArgs(confirmation)).toMatchObject({
      operation: {
        source: { entityType: "note", entityId: "loose-thought" },
        additionalSourceIds: ["second-thought", "third-thought"],
      },
    });
    expect(services.getLastEnqueuedJob()).toBeUndefined();
  });

  it("queues one generation written from all of them", async () => {
    const { services, generate } = setup();

    const confirmation = await generate(
      several(
        "refined-note",
        { entityType: "note", entityId: "loose-thought" },
        ["second-thought"],
      ),
    );
    const result = await generate(expectConfirmationArgs(confirmation));

    expect(result).toMatchObject({
      success: true,
      data: { entityId: "loose-thought" },
    });
    expect(jobData(services)).toMatchObject({
      prompt: 'Write a refined-note from "Loose thought" and "Second thought".',
      sourceEntityType: "note",
      sourceEntityIds: ["loose-thought", "second-thought"],
    });
  });

  it("names what uses its sources up after the first of them, with a prompt too", async () => {
    const { services, generate } = setup();

    const confirmation = await generate(
      refine(
        { entityType: "note", entityId: "loose-thought" },
        "Write it as a checklist of at most five items",
      ),
    );
    const result = await generate(expectConfirmationArgs(confirmation));

    // The prompt directs the writing; it is not what the entry is called.
    expect(result).toMatchObject({
      success: true,
      data: { entityId: "loose-thought" },
    });
    expect(jobData(services)).toMatchObject({
      prompt: "Write it as a checklist of at most five items",
    });
  });

  it("counts a source named twice once", async () => {
    const { services, generate } = setup();

    const confirmation = await generate(
      several(
        "refined-note",
        { entityType: "note", entityId: "loose-thought" },
        ["Loose thought", "second-thought", "second-thought"],
      ),
    );
    await generate(expectConfirmationArgs(confirmation));

    expect(jobData(services)).toMatchObject({
      sourceEntityIds: ["loose-thought", "second-thought"],
    });
  });

  it("answers not found when one of them is not there, and queues nothing", async () => {
    const { services, generate } = setup();

    const result = await generate(
      several(
        "refined-note",
        { entityType: "note", entityId: "loose-thought" },
        ["no-such-thought"],
      ),
    );

    expect(result).toMatchObject({ success: false, code: "source-not-found" });
    expect(services.getLastEnqueuedJob()).toBeUndefined();
  });

  it("writes a type that keeps its sources from several of them too", async () => {
    const { services, generate } = setup();
    services.addEntities([seeded("another-essay", "post", "Another essay")]);

    const confirmation = await generate(
      several("newsletter", { entityType: "post", entityId: "an-essay" }, [
        "another-essay",
      ]),
    );

    expect(confirmation).toMatchObject({
      needsConfirmation: true,
      summary: "Generate newsletter?",
    });
    await generate(expectConfirmationArgs(confirmation));
    expect(jobData(services)).toMatchObject({
      sourceEntityType: "post",
      sourceEntityIds: ["an-essay", "another-essay"],
    });
    expect(services.getEntities().has("another-essay")).toBe(true);
  });

  it("takes several sources only on a generation written from a source", () => {
    expect(
      generateInputSchema.safeParse({
        operation: {
          kind: "prompt",
          entityType: "newsletter",
          prompt: "Write about tides",
          additionalSourceIds: ["an-essay"],
        },
      }).success,
    ).toBe(false);
  });
});
