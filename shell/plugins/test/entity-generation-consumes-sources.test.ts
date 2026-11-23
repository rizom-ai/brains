import { describe, expect, it } from "bun:test";
import type { CallerPrincipal } from "@brains/content-service";
import type { ActorRef } from "@brains/contracts";
import type { BaseEntity, ContentVisibility } from "@brains/entity-service";
import { PermissionService } from "@brains/templates";
import { createMockProgressReporter } from "@brains/test-utils";
import { z } from "@brains/utils/zod";
import { createMockShell, type MockShell } from "../src/test/mock-shell";
import {
  defineEntity,
  defineEntityPackage,
  instantiatePluginPackageDefinition,
  type ToolContext,
} from "../src";

// Loose captures another package keeps: what a polished entry is written from.
const SCRAP = "scrap";

const polishedInput = z.object({
  prompt: z.string().optional(),
  fail: z.boolean().optional(),
  sourceEntityType: z.string().optional(),
  sourceEntityId: z.string().optional(),
  sourceEntityIds: z.array(z.string()).optional(),
});

// Written from scraps, which it uses up.
const polished = defineEntity({
  type: "polished",
  purpose: "A worked-out entry written from scraps.",
  metadata: z.object({ title: z.string(), status: z.string().optional() }),
  config: { consumesSources: [SCRAP] },
  stub: ({ title }) => ({
    content: "",
    metadata: { title, status: "generating" },
  }),
  generation: {
    input: polishedInput,
    generate: async ({ input }) =>
      input.fail
        ? { success: false, error: "Nothing to write" }
        : {
            success: true,
            id: "polished",
            content: "Worked out",
            metadata: { title: "Polished" },
          },
  },
});

// Written from scraps too, but it leaves them where they are.
const digest = defineEntity({
  type: "digest",
  purpose: "A summary written from scraps.",
  metadata: z.object({ title: z.string() }),
  generation: {
    input: polishedInput,
    generate: async () => ({
      success: true,
      id: "digest",
      content: "Summed up",
      metadata: { title: "Digest" },
    }),
  },
});

type Level = CallerPrincipal["permissionLevel"];

function entry(
  id: string,
  entityType: string,
  visibility: ContentVisibility,
): BaseEntity {
  const now = new Date().toISOString();
  return {
    id,
    entityType,
    content: `A ${visibility} ${entityType}`,
    contentHash: id,
    metadata: {},
    visibility,
    created: now,
    updated: now,
  };
}

async function install(
  principals: Record<string, Level>,
  permissions?: PermissionService,
): Promise<MockShell> {
  const shell = createMockShell({
    resolvePrincipal: async (
      actor: ActorRef,
    ): Promise<CallerPrincipal | null> => {
      if (actor.kind !== "user") return null;
      const level = principals[actor.userId];
      return level ? { userId: actor.userId, permissionLevel: level } : null;
    },
  });
  if (permissions) {
    shell.getPermissionService = (): PermissionService => permissions;
  }
  const plugins = instantiatePluginPackageDefinition(
    defineEntityPackage({ id: "polish", entities: [polished, digest] }),
    {},
    { name: "@fixture/polish", version: "0.1.0" },
  );
  for (const plugin of plugins) await plugin.register(shell);
  shell.addEntities([
    entry("first", SCRAP, "public"),
    entry("second", SCRAP, "restricted"),
    entry("an-essay", "essay", "public"),
    { ...entry("a-plan", "essay", "public"), content: LINKING },
  ]);
  return shell;
}

// An entry that links the first scrap, bare, with a label and to a heading,
// and an entry whose id only starts like it.
const LINKING =
  "See [[first]], [[first|the first scrap]], [[first#notes]] and [[first-draft]].";

function toolCaller(userId: string, level: Level): ToolContext {
  return {
    interfaceType: "mcp",
    actor: { kind: "user", userId },
    userPermissionLevel: level,
  };
}

/** Queue the type's generation as system_generate does, and run it. */
async function generate(
  shell: MockShell,
  entityType: string,
  data: Record<string, unknown>,
  caller: ToolContext,
): Promise<unknown> {
  const enqueue = shell.getEntityRegistry().getGenerationEnqueuer(entityType);
  if (!enqueue) throw new Error(`${entityType} queues no generation`);
  const jobId = await enqueue(data, caller);
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

async function exists(
  shell: MockShell,
  entityType: string,
  id: string,
): Promise<boolean> {
  const found = await shell
    .getEntityService()
    .getEntity({ entityType, id, visibilityScope: "restricted" });
  return found !== null;
}

describe("a generation whose type uses up its sources", () => {
  it("removes every source once what it wrote is saved", async () => {
    const shell = await install({ usr_admin: "admin" });

    expect(
      await generate(
        shell,
        "polished",
        { sourceEntityType: SCRAP, sourceEntityIds: ["first", "second"] },
        toolCaller("usr_admin", "admin"),
      ),
    ).toEqual({ success: true, entityId: "polished" });

    expect(await exists(shell, "polished", "polished")).toBe(true);
    expect(await exists(shell, SCRAP, "first")).toBe(false);
    expect(await exists(shell, SCRAP, "second")).toBe(false);
  });

  it("keeps its sources when nothing was written", async () => {
    const shell = await install({ usr_admin: "admin" });

    expect(
      await generate(
        shell,
        "polished",
        { fail: true, sourceEntityType: SCRAP, sourceEntityIds: ["first"] },
        toolCaller("usr_admin", "admin"),
      ),
    ).toMatchObject({ success: false });

    expect(await exists(shell, "polished", "polished")).toBe(false);
    expect(await exists(shell, SCRAP, "first")).toBe(true);
  });

  // A job killed after it removed a source runs its follow-ups again: what
  // is already gone is removed, not something it failed to remove.
  it("counts a source that is already gone as removed", async () => {
    const shell = await install({ usr_admin: "admin" });

    expect(
      await generate(
        shell,
        "polished",
        { sourceEntityType: SCRAP, sourceEntityIds: ["first", "gone-before"] },
        toolCaller("usr_admin", "admin"),
      ),
    ).toEqual({ success: true, entityId: "polished" });

    expect(await exists(shell, SCRAP, "first")).toBe(false);
  });

  it("keeps a source of a type it does not use up", async () => {
    const shell = await install({ usr_admin: "admin" });

    expect(
      await generate(
        shell,
        "polished",
        { sourceEntityType: "essay", sourceEntityIds: ["an-essay"] },
        toolCaller("usr_admin", "admin"),
      ),
    ).toEqual({ success: true, entityId: "polished" });

    expect(await exists(shell, "essay", "an-essay")).toBe(true);
  });

  it("keeps what it wrote and names the sources its requester may not delete", async () => {
    const shell = await install(
      { usr_trusted: "trusted" },
      new PermissionService({
        entityActions: { [SCRAP]: { delete: "admin" } },
      }),
    );

    const result = await generate(
      shell,
      "polished",
      { sourceEntityType: SCRAP, sourceEntityIds: ["first"] },
      toolCaller("usr_trusted", "trusted"),
    );

    expect(result).toMatchObject({ success: false, entityId: "polished" });
    expect(result).toMatchObject({
      error: expect.stringContaining("scrap/first"),
    });
    expect(await exists(shell, "polished", "polished")).toBe(true);
    expect(await exists(shell, SCRAP, "first")).toBe(true);
  });

  // A source more private than its requester may write refuses the whole
  // generation, so nothing is written and nothing is removed.
  it("keeps every source when one is more private than its requester may write", async () => {
    const shell = await install({ usr_trusted: "trusted" });

    expect(
      await generate(
        shell,
        "polished",
        { sourceEntityType: SCRAP, sourceEntityIds: ["first", "second"] },
        toolCaller("usr_trusted", "trusted"),
      ),
    ).toMatchObject({ success: false });

    expect(await exists(shell, "polished", "polished")).toBe(false);
    expect(await exists(shell, SCRAP, "first")).toBe(true);
    expect(await exists(shell, SCRAP, "second")).toBe(true);
  });
});

async function contentOf(
  shell: MockShell,
  entityType: string,
  id: string,
): Promise<string | undefined> {
  const found = await shell
    .getEntityService()
    .getEntity({ entityType, id, visibilityScope: "restricted" });
  return found?.content;
}

describe("links to a source a generation uses up", () => {
  it("point at what was written from it", async () => {
    const shell = await install({ usr_admin: "admin" });

    expect(
      await generate(
        shell,
        "polished",
        { sourceEntityType: SCRAP, sourceEntityIds: ["first"] },
        toolCaller("usr_admin", "admin"),
      ),
    ).toEqual({ success: true, entityId: "polished" });

    expect(await contentOf(shell, "essay", "a-plan")).toBe(
      "See [[polished]], [[polished|the first scrap]], [[polished#notes]] and [[first-draft]].",
    );
  });

  it("stay as they are in an entry its requester may not update", async () => {
    const shell = await install(
      { usr_trusted: "trusted" },
      new PermissionService({
        entityActions: { essay: { update: "admin" } },
      }),
    );

    expect(
      await generate(
        shell,
        "polished",
        { sourceEntityType: SCRAP, sourceEntityIds: ["first"] },
        toolCaller("usr_trusted", "trusted"),
      ),
    ).toEqual({ success: true, entityId: "polished" });

    expect(await exists(shell, SCRAP, "first")).toBe(false);
    expect(await contentOf(shell, "essay", "a-plan")).toBe(LINKING);
  });

  it("stay as they are while the source is kept", async () => {
    const shell = await install(
      { usr_trusted: "trusted" },
      new PermissionService({
        entityActions: { [SCRAP]: { delete: "admin" } },
      }),
    );

    await generate(
      shell,
      "polished",
      { sourceEntityType: SCRAP, sourceEntityIds: ["first"] },
      toolCaller("usr_trusted", "trusted"),
    );

    expect(await exists(shell, SCRAP, "first")).toBe(true);
    expect(await contentOf(shell, "essay", "a-plan")).toBe(LINKING);
  });
});

describe("a generation whose type keeps its sources", () => {
  it("leaves them where they are", async () => {
    const shell = await install({ usr_admin: "admin" });

    expect(
      await generate(
        shell,
        "digest",
        { sourceEntityType: SCRAP, sourceEntityIds: ["first"] },
        toolCaller("usr_admin", "admin"),
      ),
    ).toEqual({ success: true, entityId: "digest" });

    expect(await exists(shell, SCRAP, "first")).toBe(true);
  });
});
