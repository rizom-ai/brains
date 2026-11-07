import { describe, expect, it } from "bun:test";
import type { CallerPrincipal } from "@brains/content-service";
import { PermissionService } from "@brains/templates";
import { createMockProgressReporter } from "@brains/test-utils";
import { z } from "@brains/utils/zod";
import { createMockShell, type MockShell } from "../src/test/mock-shell";
import {
  createServicePluginContext,
  defineBusContract,
  defineEntity,
  defineJob,
  defineServicePlugin,
  defineTool,
  instantiatePluginPackageDefinition,
  type Plugin,
  type PluginCapabilities,
  type ToolContext,
} from "../src";

// The package's own type, and another package's.
const note = defineEntity({
  type: "private-note",
  purpose: "A note the package keeps",
  metadata: z.object({ seen: z.boolean().default(false) }),
});
const foreign = defineEntity({
  type: "foreign-record",
  purpose: "A type another package owns",
  metadata: z.object({}),
});

// What the brain allows callers: writes are for admins, as on the platform.
const adminWrites = {
  entityActions: {
    "*": { create: "admin", update: "admin", delete: "admin" },
  },
} as const;

const markSeen = defineBusContract({
  channel: "@fixture/notes:mark-seen",
  request: z.object({ id: z.string() }),
  response: z.object({ seen: z.boolean(), foreignVisible: z.boolean() }),
  delivery: "request",
});
const sweep = defineJob({
  name: "sweep",
  input: z.object({ id: z.string() }),
  output: z.object({ seen: z.boolean() }),
});

const guest: ToolContext = {
  interfaceType: "web-chat",
  actor: { kind: "user", userId: "usr_guest" },
  userPermissionLevel: "public",
};

const notes = defineServicePlugin(
  { id: "notes", config: z.object({}), entities: [note] },
  {
    subscriptions: ({ answer, entities, jobs }) => [
      answer(markSeen, async ({ request }) => {
        // Acting as itself, the package reads its own records at every
        // visibility, and other packages' at its grant.
        const own = await entities.get(note, request.id);
        const other = await entities.get(foreign, "secret");
        if (!own) return { seen: false, foreignVisible: other !== null };
        await entities.update(note, own, { metadata: { seen: true } });
        // A job the package queues for itself acts as the package too.
        await jobs.enqueue(sweep, { id: request.id });
        return { seen: true, foreignVisible: other !== null };
      }),
    ],
    jobs: ({ entities }) => [
      sweep.handle(async ({ input }) => {
        const own = await entities.get(note, input.id);
        if (!own) return { seen: false };
        await entities.update(note, own, {
          content: `${own.content} (swept)`,
        });
        return { seen: true };
      }),
    ],
    tools: ({ entities, jobs }) => [
      defineTool({
        name: "touch",
        description: "Mark a note seen as the caller",
        input: z.object({ id: z.string() }),
        output: z.object({}),
        permission: "public",
        async execute({ input }) {
          const own = await entities.get(note, input.id);
          if (own) {
            await entities.update(note, own, { metadata: { seen: true } });
          }
          return {};
        },
      }),
      defineTool({
        name: "queue-sweep",
        description: "Queue a sweep as the caller",
        input: z.object({ id: z.string() }),
        output: z.object({ jobId: z.string() }),
        permission: "public",
        execute: async ({ input }) => ({
          jobId: (await jobs.enqueue(sweep, input)).id,
        }),
      }),
    ],
  },
);

async function install(): Promise<{
  shell: MockShell;
  capabilities: PluginCapabilities;
}> {
  const shell = createMockShell({
    // The guest has an account, so a job it queues may run.
    resolvePrincipal: async (): Promise<CallerPrincipal | null> => ({
      userId: "usr_guest",
      permissionLevel: "public",
    }),
  });
  // No permission rule grants the package anything.
  shell.getPermissionService = (): PermissionService =>
    new PermissionService(adminWrites);
  const plugins = instantiatePluginPackageDefinition(
    notes,
    {},
    { name: "@fixture/notes", version: "0.1.0" },
  );
  const registered = await plugins.reduce<
    Promise<{ plugin: Plugin; capabilities: PluginCapabilities }[]>
  >(
    async (done, plugin) => [
      ...(await done),
      { plugin, capabilities: await plugin.register(shell) },
    ],
    Promise.resolve([]),
  );
  const service = registered.find(({ plugin }) => plugin.type === "service");
  if (!service) throw new Error("No service plugin");
  for (const [entityType, id] of [
    [note.type, "kept"],
    [foreign.type, "secret"],
  ] as const) {
    await shell.getEntityService().createEntity({
      entity: {
        id,
        entityType,
        content: "Restricted",
        metadata: {},
        visibility: "restricted",
      },
    });
  }
  return { shell, capabilities: service.capabilities };
}

async function runQueued(shell: MockShell, jobId: string): Promise<unknown> {
  const queue = shell.getJobQueueService();
  const job = await queue.getStatus(jobId);
  const handler = job ? queue.getHandler(job.type) : undefined;
  if (!job || !handler) throw new Error(`Job ${jobId} was not queued`);
  const data = handler.validateAndParse(JSON.parse(job.data));
  if (data === null) throw new Error(`Job ${jobId} was refused its data`);
  return handler.process(
    data,
    job.id,
    createMockProgressReporter(),
    new AbortController().signal,
  );
}

async function stored(
  shell: MockShell,
  id: string,
): Promise<{ content: string; metadata: unknown } | null> {
  return shell.getEntityService().getEntity({
    entityType: note.type,
    id,
    visibilityScope: "restricted",
  });
}

describe("a package acting as itself", () => {
  it("writes and reads its own types past the callers' policy, with no grant", async () => {
    const { shell } = await install();

    const asker = createServicePluginContext(shell, "calendar");
    expect(await asker.messaging.request(markSeen, { id: "kept" })).toEqual({
      status: "answered",
      data: { seen: true, foreignVisible: false },
    });
    expect((await stored(shell, "kept"))?.metadata).toEqual({ seen: true });

    // The job it queued for itself acts as the package as well.
    const queued = await shell.getJobQueueService().getRecentJobs();
    const own = queued.find((job) => job.type.endsWith("sweep"));
    if (!own) throw new Error("The package queued no sweep");
    expect(await runQueued(shell, own.id)).toEqual({ seen: true });
    expect((await stored(shell, "kept"))?.content).toBe("Restricted (swept)");
  });

  it("leaves a caller held to the policy on the same type", async () => {
    const { shell, capabilities } = await install();
    const tool = (
      name: string,
    ): NonNullable<PluginCapabilities["tools"][number]> => {
      const found = capabilities.tools.find(
        (candidate) => candidate.name === `notes_${name}`,
      );
      if (!found) throw new Error(`No tool ${name}`);
      return found;
    };
    // The guest sees the note only when it is public.
    const kept = await shell.getEntityService().getEntity({
      entityType: note.type,
      id: "kept",
      visibilityScope: "restricted",
    });
    if (!kept) throw new Error("The note was not seeded");
    await shell.getEntityService().updateEntity({
      entity: { ...kept, visibility: "public" },
    });

    expect(await tool("touch").handler({ id: "kept" }, guest)).toMatchObject({
      success: false,
      code: "permission_denied",
    });

    // A job the guest queued carries the guest's level.
    const queued = z
      .object({ data: z.object({ jobId: z.string() }) })
      .parse(await tool("queue-sweep").handler({ id: "kept" }, guest))
      .data.jobId;
    expect(runQueued(shell, queued)).rejects.toMatchObject({
      code: "permission_denied",
    });
    expect((await stored(shell, "kept"))?.content).toBe("Restricted");
  });
});
