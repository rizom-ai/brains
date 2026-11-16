import { beforeEach, describe, expect, it } from "bun:test";
import type { CallerPrincipal } from "@brains/content-service";
import type { ActorRef } from "@brains/contracts";
import type { BaseEntity, ContentVisibility } from "@brains/entity-service";
import type { ContentGenerationConfig, ToolContext } from "@brains/plugins";
import { createPluginHarness } from "@brains/plugins/test";
import {
  createMockProgressReporter,
  createSilentLogger,
} from "@brains/test-utils";
import { refinedNotePlugin } from "./refined-note-plugin";

type Harness = ReturnType<typeof createPluginHarness>;

const admin: ToolContext = {
  interfaceType: "mcp",
  actor: { kind: "user", userId: "usr_admin" },
  userPermissionLevel: "admin",
};

function entry(
  id: string,
  entityType: string,
  title: string,
  content: string,
  visibility: ContentVisibility = "public",
): BaseEntity {
  const now = new Date().toISOString();
  return {
    id,
    entityType,
    content,
    contentHash: id,
    metadata: { title },
    visibility,
    created: now,
    updated: now,
  };
}

describe("the refined note generation", () => {
  let harness: Harness;
  let configs: ContentGenerationConfig[];
  let reply: unknown;

  beforeEach(async () => {
    harness = createPluginHarness({
      logger: createSilentLogger("refined-note-generation"),
      resolvePrincipal: async (
        actor: ActorRef,
      ): Promise<CallerPrincipal | null> =>
        actor.kind === "user" && actor.userId === "usr_admin"
          ? { userId: actor.userId, permissionLevel: "admin" }
          : null,
    });
    await harness.installPlugin(refinedNotePlugin());
    configs = [];
    reply = {
      title: "Push beats pull",
      summary: "People use what comes to them.",
      body: "The worked-out argument.",
    };
    harness.getMockShell().generateContent = async (
      config: ContentGenerationConfig,
    ): Promise<unknown> => {
      configs.push(config);
      return reply;
    };
    harness
      .getMockShell()
      .addEntities([
        entry(
          "dashboard",
          "note",
          "Dashboard",
          "Sam stopped using the dashboard after a week.",
        ),
        entry(
          "digest",
          "note",
          "Digest",
          "Nobody opens the weekly digest.",
          "restricted",
        ),
        entry("an-essay", "post", "An essay", "An essay about tides."),
      ]);
  });

  /** Queue the generation as system_generate does, and run it. */
  async function refine(data: Record<string, unknown>): Promise<unknown> {
    const shell = harness.getMockShell();
    const enqueue = shell
      .getEntityRegistry()
      .getGenerationEnqueuer("refined-note");
    if (!enqueue) throw new Error("refined-note queues no generation");
    const jobId = await enqueue(data, admin);
    const job = await shell.getJobQueueService().getStatus(jobId);
    if (!job) throw new Error(`Missing job ${jobId}`);
    const handler = shell.getJobQueueService().getHandler(job.type);
    if (!handler) throw new Error(`No handler for ${job.type}`);
    const parsed = handler.validateAndParse(JSON.parse(job.data));
    if (parsed === null) throw new Error(`Invalid job data for ${job.type}`);
    return handler.process(
      parsed,
      job.id,
      createMockProgressReporter(),
      new AbortController().signal,
    );
  }

  function stored(entityType: string, id: string): Promise<BaseEntity | null> {
    return harness
      .getEntityService()
      .getEntity({ entityType, id, visibilityScope: "restricted" });
  }

  it("writes one refined note from a note and removes the note", async () => {
    const result = await refine({
      sourceEntityType: "note",
      sourceEntityIds: ["dashboard"],
    });

    expect(result).toMatchObject({
      success: true,
      entityId: "push-beats-pull",
    });
    const refined = await stored("refined-note", "push-beats-pull");
    expect(refined?.metadata).toEqual({
      title: "Push beats pull",
      summary: "People use what comes to them.",
    });
    expect(refined?.content).toContain("The worked-out argument.");
    expect(await stored("note", "dashboard")).toBeNull();
  });

  it("writes through its own template, from the note as written", async () => {
    await refine({ sourceEntityType: "note", sourceEntityIds: ["dashboard"] });

    // The note's title and text, and nothing that says where it is kept.
    expect(configs).toEqual([
      {
        prompt:
          "The loose note:\n\nDashboard\n\nSam stopped using the dashboard after a week.",
        templateName: "refined-note:refinement",
        representedIdentity: "none",
      },
    ]);
  });

  it("writes one refined note from several notes and removes them all", async () => {
    const result = await refine({
      sourceEntityType: "note",
      sourceEntityIds: ["dashboard", "digest"],
    });

    expect(result).toMatchObject({ success: true });
    expect(configs[0]?.prompt).toContain(
      "Sam stopped using the dashboard after a week.",
    );
    expect(configs[0]?.prompt).toContain("Nobody opens the weekly digest.");
    expect(await stored("note", "dashboard")).toBeNull();
    expect(await stored("note", "digest")).toBeNull();
    // No more visible than the most private note it was written from.
    expect((await stored("refined-note", "push-beats-pull"))?.visibility).toBe(
      "restricted",
    );
  });

  it("follows the direction its caller gives", async () => {
    await refine({
      prompt: "Focus on what this means for onboarding",
      sourceEntityType: "note",
      sourceEntityIds: ["dashboard"],
    });

    expect(configs[0]?.prompt).toContain(
      "Focus on what this means for onboarding",
    );
  });

  it("keeps the title its caller gives", async () => {
    await refine({
      title: "Why the dashboard went quiet",
      sourceEntityType: "note",
      sourceEntityIds: ["dashboard"],
    });

    expect(
      (await stored("refined-note", "why-the-dashboard-went-quiet"))?.metadata,
    ).toMatchObject({ title: "Why the dashboard went quiet" });
  });

  it("fills the placeholder system_generate allocated", async () => {
    const now = new Date().toISOString();
    await harness.getEntityService().createEntity({
      entity: {
        id: "worked-out",
        entityType: "refined-note",
        content: "",
        metadata: { title: "Dashboard", summary: "", status: "generating" },
        visibility: "public",
        created: now,
        updated: now,
      },
    });

    const result = await refine({
      entityId: "worked-out",
      sourceEntityType: "note",
      sourceEntityIds: ["dashboard"],
    });

    expect(result).toMatchObject({ success: true, entityId: "worked-out" });
    expect((await stored("refined-note", "worked-out"))?.metadata).toEqual({
      title: "Push beats pull",
      summary: "People use what comes to them.",
    });
    expect(await stored("note", "dashboard")).toBeNull();
  });

  it.each([
    ["names no note", {}],
    [
      "is written from another type",
      { sourceEntityType: "post", sourceEntityIds: ["an-essay"] },
    ],
  ])("refuses a request that %s, and writes nothing", async (_case, data) => {
    const result = await refine(data);

    expect(result).toMatchObject({
      success: false,
      error: "A refined note is written from one or more notes.",
    });
    expect(configs).toEqual([]);
    expect(await stored("post", "an-essay")).not.toBeNull();
  });

  it("refuses when a note it names is not there, and keeps the others", async () => {
    const result = await refine({
      sourceEntityType: "note",
      sourceEntityIds: ["dashboard", "gone"],
    });

    expect(result).toMatchObject({
      success: false,
      error: "Note not found: gone",
    });
    expect(configs).toEqual([]);
    expect(await stored("note", "dashboard")).not.toBeNull();
  });

  it("keeps the notes when what the brain wrote has no summary", async () => {
    reply = { title: "Push beats pull", summary: " ", body: "An argument." };

    const result = await refine({
      sourceEntityType: "note",
      sourceEntityIds: ["dashboard"],
    });

    expect(result).toMatchObject({ success: false });
    expect(await stored("refined-note", "push-beats-pull")).toBeNull();
    expect(await stored("note", "dashboard")).not.toBeNull();
  });
});
