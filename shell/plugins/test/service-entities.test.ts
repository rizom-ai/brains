import {
  describe,
  expect,
  expectTypeOf,
  it,
  mock,
  spyOn,
  type Mock,
} from "bun:test";
import type { CallerPrincipal } from "@brains/content-service";
import type { BaseEntity, ContentVisibility } from "@brains/entity-service";
import { PermissionService } from "@brains/templates";
import { createMockProgressReporter } from "@brains/test-utils";
import { z } from "@brains/utils/zod";
import { createMockShell, type MockShell } from "../src/test/mock-shell";
import type {
  OwnedEntityWriter,
  ServiceJobs,
} from "../src/service/service-definition-contract";
import {
  defineEntity,
  defineJob,
  defineServicePlugin,
  defineTool,
  instantiatePluginPackageDefinition,
  type EntityOf,
  type EntityReader,
  type Plugin,
  type PluginCapabilities,
  type ToolContext,
} from "../src";

const reminder = defineEntity({
  type: "reminder",
  purpose: "A task to remember",
  metadata: z.object({
    status: z.enum(["open", "done"]),
    dueAt: z.string(),
  }),
});
const stranger = defineEntity({
  type: "stranger",
  purpose: "A type this package does not own",
  metadata: z.object({}),
});

const visibilities: ContentVisibility[] = ["public", "shared", "restricted"];
const allIds = visibilities.map((visibility) => `${visibility}-reminder`);

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

const listDue = defineJob({
  name: "list-due",
  input: z.object({}),
  output: z.object({ ids: z.array(z.string()) }),
});
const closeAll = defineJob({
  name: "close-all",
  input: z.object({}),
  output: z.object({ closed: z.array(z.string()) }),
});

/** Registers the package's plugins the way the brain does, in order. */
async function install(
  shell: MockShell,
  definition: Parameters<typeof instantiatePluginPackageDefinition>[0],
): Promise<{ plugins: Plugin[]; service: PluginCapabilities }> {
  const plugins = instantiatePluginPackageDefinition(
    definition,
    {},
    {
      name: "@fixture/reminders",
      version: "0.1.0",
    },
  );
  // One after another: a declared type exists before the service registers.
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
  return { plugins, service: service.capabilities };
}

function reminderShell(
  resolvePrincipal: Mock<() => Promise<CallerPrincipal | null>> = mock(
    async (): Promise<CallerPrincipal | null> => null,
  ),
): MockShell {
  return createMockShell({ resolvePrincipal });
}

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

async function rejection(operation: Promise<unknown>): Promise<unknown> {
  return operation.then(
    () => {
      throw new Error("Expected rejection");
    },
    (error: unknown) => error,
  );
}

interface Installed {
  plugins: Plugin[];
  call: (name: string, input: object, caller: ToolContext) => Promise<unknown>;
  jobs: ServiceJobs;
  entities: EntityReader & OwnedEntityWriter<typeof reminder>;
}

async function installReminders(shell: MockShell): Promise<Installed> {
  let captured:
    { jobs: ServiceJobs; entities: Installed["entities"] } | undefined;
  const definition = defineServicePlugin(
    { id: "reminders", config: z.object({}), entities: [reminder] },
    {
      jobs: ({ entities }) => [
        listDue.handle(async (context) => {
          // One `entities` in scope: the handler is given none of its own.
          expect("entities" in context).toBe(false);
          return {
            ids: (await entities.list(reminder)).map((item) => item.id),
          };
        }),
        closeAll.handle(async () => {
          const open = await entities.list(reminder);
          await Promise.all(
            open.map((item) =>
              entities.update(reminder, item, {
                metadata: { ...item.metadata, status: "done" },
              }),
            ),
          );
          return { closed: open.map((item) => item.id) };
        }),
      ],
      tools: ({ entities, jobs }) => {
        captured = { jobs, entities };
        return [
          defineTool({
            name: "list",
            description: "List reminders",
            input: z.object({}),
            output: z.object({ ids: z.array(z.string()) }),
            permission: "public",
            execute: async () => ({
              ids: (await entities.list(reminder)).map((item) => item.id),
            }),
          }),
          defineTool({
            name: "add",
            description: "Remember a task",
            input: z.object({ id: z.string(), dueAt: z.string() }),
            output: z.object({ id: z.string() }),
            permission: "public",
            execute: ({ input }) =>
              entities.create(reminder, {
                id: input.id,
                content: "Call Sam",
                metadata: { status: "open", dueAt: input.dueAt },
              }),
          }),
          defineTool({
            name: "queue-list",
            description: "List reminders in a job",
            input: z.object({}),
            output: z.object({ jobId: z.string() }),
            permission: "public",
            execute: async () => ({
              jobId: (await jobs.enqueue(listDue, {})).id,
            }),
          }),
          defineTool({
            name: "queue-close",
            description: "Close every reminder in a job",
            input: z.object({}),
            output: z.object({ jobId: z.string() }),
            permission: "public",
            execute: async () => ({
              jobId: (await jobs.enqueue(closeAll, {})).id,
            }),
          }),
        ];
      },
    },
  );
  const { plugins, service: capabilities } = await install(shell, definition);
  // Stored through the entity service, as the files a brain holds are.
  await Promise.all(
    visibilities.map((visibility) =>
      shell.getEntityService().createEntity({
        entity: {
          id: `${visibility}-reminder`,
          entityType: reminder.type,
          content: `A ${visibility} reminder`,
          metadata: { status: "open", dueAt: "2000-01-01" },
          visibility,
        },
      }),
    ),
  );
  if (!captured) throw new Error("Tools slot was not read");
  const byName = new Map(capabilities.tools.map((tool) => [tool.name, tool]));
  return {
    plugins,
    jobs: captured.jobs,
    entities: captured.entities,
    call: async (name, input, caller): Promise<unknown> => {
      const tool = byName.get(`reminders_${name}`);
      if (!tool) throw new Error(`No tool ${name}`);
      return tool.handler(input, caller);
    },
  };
}

const idList = z.object({ ids: z.array(z.string()) });
const sortedIds = ({ ids }: z.output<typeof idList>): string[] =>
  [...ids].sort();

const jobIdOf = (response: unknown): string =>
  z.object({ data: z.object({ jobId: z.string() }) }).parse(response).data
    .jobId;

describe("a service's own entity types", () => {
  it("installs each declared type as an entity plugin of the package", async () => {
    const shell = reminderShell();
    const { plugins } = await installReminders(shell);
    expect(plugins.map((plugin) => [plugin.type, plugin.id]).sort()).toEqual([
      ["entity", "@fixture/reminders:reminder"],
      ["service", "@fixture/reminders:reminders"],
    ]);
    expect(shell.getEntityRegistry().hasEntityType(reminder.type)).toBe(true);
  });

  it("refuses a type declared twice or named like the service", () => {
    expect(() =>
      defineServicePlugin({
        id: "twice",
        config: z.object({}),
        entities: [reminder, reminder],
      }),
    ).toThrow('Service "twice" declares entity type "reminder" more than once');
    expect(() =>
      defineServicePlugin({
        id: "reminder",
        config: z.object({}),
        entities: [reminder],
      }),
    ).toThrow(
      'Service "reminder" declares an entity type of the same name; give one of them a distinct id',
    );
  });
});

describe("service entity access reads and writes as the current caller", () => {
  it("inside a tool, reads at the tool caller's visibility", async () => {
    const resolvePrincipal = mock(
      async (): Promise<CallerPrincipal | null> => ({
        userId: "usr_admin",
        permissionLevel: "admin",
      }),
    );
    const { call } = await installReminders(reminderShell(resolvePrincipal));

    expect(await call("list", {}, guest)).toMatchObject({
      success: true,
      data: { ids: ["public-reminder"] },
    });
    expect(
      sortedIds(
        z.object({ data: idList }).parse(await call("list", {}, admin)).data,
      ),
    ).toEqual([...allIds].sort());
  });

  it("inside a tool, writes as the tool caller and is held to the type's action policy", async () => {
    const shell = reminderShell();
    shell.getPermissionService = (): PermissionService =>
      new PermissionService({
        entityActions: { reminder: { create: "trusted" } },
      });
    const { call } = await installReminders(shell);

    expect(
      await call("add", { id: "call", dueAt: "2001-01-01" }, guest),
    ).toMatchObject({
      success: false,
      error: expect.stringContaining("create"),
    });
    expect(
      await shell.getEntityService().getEntity({
        entityType: reminder.type,
        id: "call",
        visibilityScope: "restricted",
      }),
    ).toBeNull();
  });

  it("records the tool caller as the author of what it writes", async () => {
    const shell = reminderShell();
    const created = spyOn(shell.getEntityService(), "createEntity");
    const { call } = await installReminders(shell);

    expect(
      await call("add", { id: "call", dueAt: "2001-01-01" }, guest),
    ).toEqual({ success: true, data: { id: "call" } });
    const written = created.mock.calls.find(
      ([request]) => request.entity.id === "call",
    );
    expect(written?.[0].options?.eventContext).toEqual({
      actor: guest.actor,
      interfaceType: guest.interfaceType,
    });
  });

  it("inside a running job, reads and writes as the requester", async () => {
    const shell = reminderShell();
    shell.getPermissionService = (): PermissionService =>
      new PermissionService({
        entityActions: { reminder: { update: "trusted" } },
      });
    const { call } = await installReminders(shell);

    expect(
      await runQueuedJob(shell, jobIdOf(await call("queue-list", {}, guest))),
    ).toEqual({ ids: ["public-reminder"] });
    // A public requester may not update a type that requires trusted.
    expect(
      await rejection(
        runQueuedJob(shell, jobIdOf(await call("queue-close", {}, guest))),
      ),
    ).toMatchObject({ code: "permission_denied" });
  });

  it("a job enqueued outside any call reads public unless the package is granted more", async () => {
    const shell = reminderShell();
    const { plugins, jobs } = await installReminders(shell);
    const service = plugins.find((plugin) => plugin.type === "service");

    const { id: ungranted } = await jobs.enqueue(listDue, {});
    expect(await runQueuedJob(shell, ungranted)).toEqual({
      ids: ["public-reminder"],
    });

    shell.getPermissionService = (): PermissionService =>
      new PermissionService({ trusted: [`service:${service?.id}`] });
    const { id: granted } = await jobs.enqueue(listDue, {});
    expect(sortedIds(idList.parse(await runQueuedJob(shell, granted)))).toEqual(
      ["public-reminder", "shared-reminder"],
    );
  });

  it("outside any call, reads and writes with the package's own grant", async () => {
    const shell = reminderShell();
    const { plugins, entities } = await installReminders(shell);
    const service = plugins.find((plugin) => plugin.type === "service");

    expect(await entities.count(reminder)).toBe(1);
    shell.getPermissionService = (): PermissionService =>
      new PermissionService({ admins: [`service:${service?.id}`] });
    expect(await entities.count(reminder)).toBe(3);
    expect(
      await entities.create(reminder, {
        id: "daily",
        content: "Daily review",
        metadata: { status: "open", dueAt: "2001-01-01" },
        visibility: "restricted",
      }),
    ).toEqual({ id: "daily" });
    const written = await entities.get(reminder, "daily");
    expectTypeOf(written).toEqualTypeOf<EntityOf<typeof reminder> | null>();
    expect(written).toMatchObject({
      visibility: "restricted",
      metadata: { status: "open" },
    });
  });
});

describe("owned writes", () => {
  it("refuses a type the header does not own, by the types and at runtime", async () => {
    const { entities } = await installReminders(reminderShell());
    expect(
      await rejection(
        entities.create(
          // @ts-expect-error Writes are limited to the header's entities.
          stranger,
          { content: "Not mine", metadata: {} },
        ),
      ),
    ).toMatchObject({ code: "permission_denied" });
  });

  it("refuses a definition that only shares an owned type's name", async () => {
    const lookalike = defineEntity({
      type: "reminder",
      purpose: "Shares a name, not the declaration",
      metadata: z.object({}),
    });
    const { entities } = await installReminders(reminderShell());
    expect(
      await rejection(
        entities.create(
          // @ts-expect-error Only the declared definition grants a write.
          lookalike,
          { content: "Imposter", metadata: {} },
        ),
      ),
    ).toMatchObject({ code: "permission_denied" });
  });

  it("refuses to create an id that already exists at any visibility", async () => {
    const shell = reminderShell();
    const { entities } = await installReminders(shell);
    expect(
      await rejection(
        entities.create(reminder, {
          id: "restricted-reminder",
          content: "Over the top",
          metadata: { status: "open", dueAt: "2001-01-01" },
        }),
      ),
    ).toMatchObject({ code: "conflict" });
  });

  it("refuses metadata the type's schema does not accept", async () => {
    const { entities } = await installReminders(reminderShell());
    const metadata = { status: "someday", dueAt: "2001-01-01" };
    expect(
      await rejection(
        entities.create(reminder, {
          content: "Later",
          // @ts-expect-error The status is not one the schema allows.
          metadata,
        }),
      ),
    ).toMatchObject({ code: "invalid_input" });
  });

  it("refuses an update or a delete of a record that changed after it was read", async () => {
    const shell = reminderShell();
    const { entities } = await installReminders(shell);
    const read = await entities.get(reminder, "public-reminder");
    if (!read) throw new Error("Missing reminder");
    await entities.update(reminder, read, { content: "Changed meanwhile" });

    expect(
      await rejection(
        entities.update(reminder, read, {
          metadata: { status: "done", dueAt: read.metadata.dueAt },
        }),
      ),
    ).toMatchObject({ code: "conflict" });
    expect(await rejection(entities.delete(reminder, read))).toMatchObject({
      code: "conflict",
    });

    const current = await entities.get(reminder, "public-reminder");
    if (!current) throw new Error("Missing reminder");
    expect(current.content).toContain("Changed meanwhile");
    await entities.delete(reminder, current);
    expect(await entities.get(reminder, "public-reminder")).toBeNull();
  });

  it("refuses to write a record the current authority cannot see", async () => {
    const shell = reminderShell();
    const { entities } = await installReminders(shell);
    const stored = await shell.getEntityService().getEntity({
      entityType: reminder.type,
      id: "restricted-reminder",
      visibilityScope: "restricted",
    });
    if (!stored) throw new Error("Missing reminder");
    const hidden: BaseEntity = stored;
    const record: EntityOf<typeof reminder> = {
      ...hidden,
      entityType: reminder.type,
      metadata: { status: "open", dueAt: "2000-01-01" },
    };
    expect(
      await rejection(entities.update(reminder, record, { content: "Peek" })),
    ).toMatchObject({ code: "not_found" });
    expect(await rejection(entities.delete(reminder, record))).toMatchObject({
      code: "not_found",
    });
  });
});
