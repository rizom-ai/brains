import { describe, expect, it, mock, type Mock } from "bun:test";
import {
  CallerAuthorizationError,
  type CallerPrincipal,
} from "@brains/content-service";
import { createExternalActorId } from "@brains/contracts";
import type { ContentVisibility } from "@brains/entity-service";
import { PermissionService } from "@brains/templates";
import { createMockProgressReporter } from "@brains/test-utils";
import { z } from "@brains/utils/zod";
import { createMockShell, type MockShell } from "../src/test/mock-shell";
import type { ServiceJobs } from "../src/service/service-definition-contract";
import {
  dashboardWidgetRegisterContract,
  defineDaemon,
  defineDashboardWidget,
  defineEntity,
  defineInterface,
  defineJob,
  defineRoute,
  defineServicePlugin,
  defineTool,
  instantiatePluginPackageDefinition,
  protocol,
  type DashboardWidgetRegistration,
  type ToolContext,
} from "../src";

const note = defineEntity({
  type: "private-note",
  purpose: "A note at one visibility",
  metadata: z.object({}),
});

const readNotesContract = {
  name: "read-notes",
  input: z.object({ ids: z.array(z.string()) }),
  output: z.object({ found: z.array(z.string()) }),
};
const readNotes = defineJob(readNotesContract);
// A job definition binds to the one service that registers it, so the
// interface and operator services each register their own.
const routedNotes = defineJob(readNotesContract);
const viewedNotes = defineJob(readNotesContract);

const visibilities: ContentVisibility[] = ["public", "shared", "restricted"];
const allNotes = ["public-note", "shared-note", "restricted-note"];
const jobReference = z.object({ data: z.object({ jobId: z.string() }) });

type Plugin = NonNullable<
  ReturnType<typeof instantiatePluginPackageDefinition>[number]
>;

function instantiate(
  definition: Parameters<typeof instantiatePluginPackageDefinition>[0],
  name: string,
  config: unknown = {},
): Plugin {
  const [plugin] = instantiatePluginPackageDefinition(definition, config, {
    name,
    version: "0.1.0",
  });
  if (!plugin) throw new Error(`Plugin ${name} was not created`);
  return plugin;
}

function noteShell(
  resolvePrincipal: Mock<() => Promise<CallerPrincipal | null>>,
): MockShell {
  const shell = createMockShell({ resolvePrincipal });
  const now = new Date().toISOString();
  shell.addEntities(
    visibilities.map((visibility) => ({
      id: `${visibility}-note`,
      entityType: note.type,
      content: `A ${visibility} note`,
      contentHash: visibility,
      metadata: {},
      visibility,
      created: now,
      updated: now,
    })),
  );
  return shell;
}

/** Runs one queued job the way the worker does: stored JSON, parse, process. */
async function runQueuedJob(shell: MockShell, jobId: string): Promise<unknown> {
  const queue = shell.getJobQueueService();
  const job = await queue.getStatus(jobId);
  if (!job) throw new Error(`Missing job ${jobId}`);
  const handler = queue.getHandler(job.type);
  if (!handler) throw new Error(`No handler for ${job.type}`);
  const data = handler.validateAndParse(JSON.parse(job.data));
  if (data === null) throw new Error(`Invalid job data for ${job.type}`);
  return handler.process(
    data,
    job.id,
    createMockProgressReporter(),
    new AbortController().signal,
  );
}

async function queuedData(shell: MockShell, jobId: string): Promise<unknown> {
  const job = await shell.getJobQueueService().getStatus(jobId);
  if (!job) throw new Error(`Missing job ${jobId}`);
  return JSON.parse(job.data);
}

async function rejection(operation: Promise<unknown>): Promise<unknown> {
  return operation.then(
    () => {
      throw new Error("Expected rejection");
    },
    (error: unknown) => error,
  );
}

const guest: ToolContext = {
  interfaceType: "web-chat",
  actor: { kind: "external", externalActorId: "ext_guest" },
  userPermissionLevel: "public",
};
const admin: ToolContext = {
  interfaceType: "mcp",
  actor: { kind: "user", userId: "usr_admin" },
  userPermissionLevel: "admin",
};

async function installNoteReader(shell: MockShell): Promise<{
  plugin: Plugin;
  readThroughTool: (toolContext: ToolContext) => Promise<string>;
  jobs: ServiceJobs;
  received: unknown[];
}> {
  const received: unknown[] = [];
  let captured: ServiceJobs | undefined;
  const definition = defineServicePlugin(
    {
      id: "note-reader",
      config: z.object({}),
    },
    {
      jobs: ({ entities }) => [
        readNotes.handle(async ({ input }) => {
          received.push(input);
          const reads = await Promise.all(
            input.ids.map(async (id) =>
              (await entities.get(note, id)) ? id : null,
            ),
          );
          return { found: reads.flatMap((id) => (id ? [id] : [])) };
        }),
      ],
      tools: ({ jobs }) => {
        captured = jobs;
        return [
          defineTool({
            name: "read-notes",
            description: "Read notes in a durable job",
            input: readNotes.input,
            output: z.object({ jobId: z.string() }),
            permission: "public",
            async execute({ input }) {
              return { jobId: (await jobs.enqueue(readNotes, input)).id };
            },
          }),
        ];
      },
    },
  );
  const plugin = instantiate(definition, "@fixture/note-reader");
  const capabilities = await plugin.register(shell);
  const tool = capabilities.tools[0];
  if (!tool || !captured) throw new Error("Tool was not registered");
  return {
    plugin,
    readThroughTool: async (toolContext) =>
      jobReference.parse(await tool.handler({ ids: allNotes }, toolContext))
        .data.jobId,
    jobs: captured,
    received,
  };
}

describe("package jobs read as their requester", () => {
  it("a job a public caller starts reads only public entries", async () => {
    const resolvePrincipal = mock(
      async (): Promise<CallerPrincipal | null> => null,
    );
    const shell = noteShell(resolvePrincipal);
    const { readThroughTool } = await installNoteReader(shell);

    const jobId = await readThroughTool(guest);

    expect(await runQueuedJob(shell, jobId)).toEqual({
      found: ["public-note"],
    });
  });

  it("a job an admin starts reads the restricted entry", async () => {
    const resolvePrincipal = mock(
      async (): Promise<CallerPrincipal | null> => ({
        userId: "usr_admin",
        permissionLevel: "admin",
      }),
    );
    const shell = noteShell(resolvePrincipal);
    const { readThroughTool } = await installNoteReader(shell);

    const jobId = await readThroughTool(admin);

    expect(await runQueuedJob(shell, jobId)).toEqual({ found: allNotes });
  });

  it("a job whose requester is revoked before it runs fails with the authorization error", async () => {
    const resolvePrincipal = mock(
      async (): Promise<CallerPrincipal | null> => ({
        userId: "usr_admin",
        permissionLevel: "admin",
      }),
    );
    const shell = noteShell(resolvePrincipal);
    const { readThroughTool, received } = await installNoteReader(shell);
    const jobId = await readThroughTool(admin);

    resolvePrincipal.mockResolvedValue(null);

    expect(await rejection(runQueuedJob(shell, jobId))).toBeInstanceOf(
      CallerAuthorizationError,
    );
    expect(received).toEqual([]);
  });

  it("a job enqueued outside a tool call reads as the service's own grant", async () => {
    const resolvePrincipal = mock(
      async (): Promise<CallerPrincipal | null> => null,
    );
    const shell = noteShell(resolvePrincipal);
    const { plugin, jobs } = await installNoteReader(shell);
    shell.getPermissionService = (): PermissionService =>
      new PermissionService({ trusted: [`service:${plugin.id}`] });

    const { id } = await jobs.enqueue(readNotes, { ids: allNotes });

    expect(await queuedData(shell, id)).toMatchObject({
      authority: {
        actor: { kind: "service", serviceId: plugin.id },
        permissionCeiling: "trusted",
      },
    });
    expect(await runQueuedJob(shell, id)).toEqual({
      found: ["public-note", "shared-note"],
    });
    expect(resolvePrincipal).not.toHaveBeenCalled();
  });

  it("queues the authority beside the input and hands the handler only its input", async () => {
    const resolvePrincipal = mock(
      async (): Promise<CallerPrincipal | null> => null,
    );
    const shell = noteShell(resolvePrincipal);
    const { readThroughTool, received } = await installNoteReader(shell);

    const jobId = await readThroughTool(guest);

    expect(await queuedData(shell, jobId)).toEqual({
      authority: { actor: guest.actor, permissionCeiling: "public" },
      input: { ids: allNotes },
    });
    await runQueuedJob(shell, jobId);
    expect(received).toEqual([{ ids: allNotes }]);

    // A job queued before requester authority existed is invalid, not run.
    const job = await shell.getJobQueueService().getStatus(jobId);
    const handler = job && shell.getJobQueueService().getHandler(job.type);
    expect(handler?.validateAndParse({ ids: allNotes })).toBeNull();
  });

  it("reads status only from the package's own job", async () => {
    const resolvePrincipal = mock(
      async (): Promise<CallerPrincipal | null> => null,
    );
    const shell = noteShell(resolvePrincipal);
    const { jobs } = await installNoteReader(shell);
    const queue = shell.getJobQueueService();
    const other = await queue.enqueue({
      type: "shell:other-job",
      data: {},
    });
    const otherJob = await queue.getStatus(other);
    if (!otherJob) throw new Error("Missing job");
    otherJob.status = "completed";
    otherJob.result = { found: ["restricted-note"] };

    expect(await jobs.status(readNotes, other)).toBeNull();

    const own = await jobs.enqueue(readNotes, { ids: [] });
    expect(await jobs.status(readNotes, own.id)).toMatchObject({
      id: own.id,
      status: "pending",
    });
  });
});

describe("interface and operator jobs read as their requester", () => {
  const readerService = defineServicePlugin(
    {
      id: "note-service",
      config: z.object({}),
    },
    {
      jobs: () => [routedNotes.handle(async () => ({ found: [] }))],
    },
  );

  it("an interface route's job carries its caller; a public route's and a daemon's carry no more than the interface", async () => {
    const resolvePrincipal = mock(
      async (): Promise<CallerPrincipal | null> => null,
    );
    const shell = noteShell(resolvePrincipal);
    shell.getPermissionService = (): PermissionService =>
      new PermissionService({ trusted: ["note-webhook:reader-1"] });
    let enqueueFromDaemon: (() => Promise<string>) | undefined;
    const definition = defineInterface(
      { id: "note-webhook", config: z.object({}) },
      {
        routes: ({ jobs }) => [
          defineRoute({
            method: "POST",
            path: "/read",
            security: protocol({
              authenticate: ({ request }) =>
                request.headers.get("x-reader") ? { id: "reader-1" } : null,
            }),
            response: z.object({ jobId: z.string() }),
            handle: async () => ({
              jobId: (await jobs.enqueue(routedNotes, { ids: allNotes })).id,
            }),
          }),
          defineRoute({
            method: "POST",
            path: "/public-read",
            security: { kind: "public" },
            response: z.object({ jobId: z.string() }),
            handle: async () => ({
              jobId: (await jobs.enqueue(routedNotes, { ids: allNotes })).id,
            }),
          }),
        ],
        daemons: ({ jobs }) => {
          enqueueFromDaemon = async (): Promise<string> =>
            (await jobs.enqueue(routedNotes, { ids: allNotes })).id;
          return [
            defineDaemon({
              id: "feed",
              required: false,
              run: async () => {},
            }),
          ];
        },
      },
    );
    await instantiate(readerService, "@fixture/note-service").register(shell);
    const plugin = instantiate(definition, "@fixture/note-webhook");
    await plugin.register(shell);
    const routes = plugin.getWebRoutes?.() ?? [];
    const route = async (path: string): Promise<string> => {
      const found = routes.find((candidate) => candidate.path === path);
      if (!found) throw new Error(`Missing route ${path}`);
      const response = await found.handler(
        new Request(`http://brain${path}`, {
          method: "POST",
          headers: { "x-reader": "yes" },
        }),
      );
      return z.object({ jobId: z.string() }).parse(await response.json()).jobId;
    };

    expect(await queuedData(shell, await route("/read"))).toMatchObject({
      authority: {
        actor: {
          kind: "external",
          externalActorId: createExternalActorId("note-webhook", "reader-1"),
        },
        permissionCeiling: "trusted",
      },
    });
    expect(await queuedData(shell, await route("/public-read"))).toMatchObject({
      authority: {
        actor: { kind: "service", serviceId: plugin.id },
        permissionCeiling: "public",
      },
    });
    if (!enqueueFromDaemon) throw new Error("Daemons were not defined");
    expect(await queuedData(shell, await enqueueFromDaemon())).toMatchObject({
      authority: {
        actor: { kind: "service", serviceId: plugin.id },
        permissionCeiling: "public",
      },
    });
  });

  it("a Studio or Dashboard viewer's job carries the viewer's account; an anonymous viewer's reads public", async () => {
    const resolvePrincipal = mock(
      async (): Promise<CallerPrincipal | null> => ({
        userId: "usr_viewer",
        permissionLevel: "trusted",
      }),
    );
    const shell = noteShell(resolvePrincipal);
    const widget = defineDashboardWidget({
      id: "note-job",
      title: "Note job",
      group: "knowledge",
      placement: "secondary",
      permission: "public",
      data: z.object({ jobId: z.string() }),
      view: ({ data }) => ({
        blocks: [
          { type: "key-values", items: [{ label: "Job", value: data.jobId }] },
        ],
      }),
    });
    const enqueued: string[] = [];
    const definition = defineServicePlugin(
      {
        id: "note-dashboard",
        config: z.object({}),
      },
      {
        jobs: () => [viewedNotes.handle(async () => ({ found: [] }))],
        dashboardWidgets: (context) => [
          widget.bind(context, async ({ jobs }) => {
            const { id } = await jobs.enqueue(viewedNotes, { ids: allNotes });
            enqueued.push(id);
            return { jobId: id };
          }),
        ],
      },
    );
    const registrations: DashboardWidgetRegistration[] = [];
    shell
      .getMessageBus()
      .subscribe<DashboardWidgetRegistration>(
        dashboardWidgetRegisterContract.name,
        (message) => {
          registrations.push(message.payload);
          return { success: true };
        },
      );
    const plugin = instantiate(definition, "@fixture/note-dashboard");
    await plugin.register(shell);
    await plugin.finalizeRegistration?.();
    const registration = registrations[0];
    if (!registration) throw new Error("Widget was not registered");
    const jobFor = async (
      caller: Parameters<
        DashboardWidgetRegistration["dataProvider"]
      >[0]["caller"],
    ): Promise<string> => {
      await registration.dataProvider({
        caller,
        signal: new AbortController().signal,
      });
      const id = enqueued.at(-1);
      if (!id) throw new Error("The widget enqueued no job");
      return id;
    };

    expect(
      await queuedData(
        shell,
        await jobFor({
          actor: { id: "usr_viewer" },
          permission: "admin",
          isAnchor: false,
        }),
      ),
    ).toMatchObject({
      authority: {
        actor: { kind: "user", userId: "usr_viewer" },
        permissionCeiling: "trusted",
        principalId: "usr_viewer",
      },
    });
    expect(await queuedData(shell, await jobFor(null))).toMatchObject({
      authority: {
        actor: { kind: "service", serviceId: plugin.id },
        permissionCeiling: "public",
      },
    });
  });
});
