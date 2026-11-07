import { describe, expect, it, spyOn } from "bun:test";
import {
  SdkError,
  defineBusContract as defineInternalBusContract,
} from "@brains/contracts";
import type { CallerPrincipal } from "@brains/content-service";
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

const reminder = defineEntity({
  type: "reminder",
  purpose: "A task to remember",
  metadata: z.object({ status: z.enum(["open", "done"]) }),
});

// Another package's question, and how its answer is shaped.
const reminderCount = defineBusContract({
  channel: "reminders:count",
  request: z.object({ status: z.enum(["open", "done"]) }),
  response: z.object({ count: z.number().int() }),
  delivery: "request",
});
const remindLater = defineBusContract({
  channel: "reminders:remind-later",
  request: z.object({ id: z.string() }),
  response: z.void(),
  delivery: "command",
});
const unanswered = defineBusContract({
  channel: "reminders:nobody",
  request: z.object({}),
  response: z.object({ ok: z.boolean() }),
  delivery: "request",
});

const admin: ToolContext = {
  interfaceType: "mcp",
  actor: { kind: "user", userId: "usr_admin" },
  userPermissionLevel: "admin",
};

const askLater = defineJob({
  name: "ask-later",
  input: z.object({}),
  output: z.object({ status: z.string() }),
});

interface Installed {
  readonly plugins: Plugin[];
  readonly service: PluginCapabilities;
  readonly heard: string[];
  readonly senders: string[];
}

async function install(
  shell: MockShell,
  definition: Parameters<typeof instantiatePluginPackageDefinition>[0],
): Promise<Pick<Installed, "plugins" | "service">> {
  const plugins = instantiatePluginPackageDefinition(
    definition,
    {},
    { name: "@fixture/reminders", version: "0.1.0" },
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
  return { plugins, service: service.capabilities };
}

async function installReminders(shell: MockShell): Promise<Installed> {
  const heard: string[] = [];
  const senders: string[] = [];
  const definition = defineServicePlugin(
    { id: "reminders", config: z.object({}), entities: [reminder] },
    {
      subscriptions: ({ answer, entities }) => [
        answer(reminderCount, async (context) => {
          // Capabilities are the slot's; the handler is given the call's data.
          expect(Object.keys(context).sort()).toEqual(["request", "sender"]);
          const { request, sender } = context;
          senders.push(sender);
          const all = await entities.list(reminder);
          return {
            count: all.filter((item) => item.metadata.status === request.status)
              .length,
          };
        }),
        answer(remindLater, async ({ request }) => {
          heard.push(request.id);
          await entities.create(reminder, {
            id: request.id,
            content: "Later",
            metadata: { status: "open" },
          });
        }),
      ],
      jobs: ({ messaging }) => [
        askLater.handle(async (context) => {
          // Capabilities are the slot's; the handler is given the call's data.
          expect(Object.keys(context).sort()).toEqual([
            "input",
            "progress",
            "signal",
          ]);
          const asked = await messaging.request(reminderCount, {
            status: "open",
          });
          return { status: asked.status };
        }),
      ],
      tools: ({ jobs, messaging }) => [
        defineTool({
          name: "queue-ask",
          description: "Ask from a job",
          input: z.object({}),
          output: z.object({ jobId: z.string() }),
          permission: "public",
          execute: async () => ({
            jobId: (await jobs.enqueue(askLater, {})).id,
          }),
        }),
        defineTool({
          name: "count-open",
          description: "Ask how many reminders are open",
          input: z.object({}),
          output: z.object({ count: z.number(), status: z.string() }),
          permission: "public",
          execute: async () => {
            const asked = await messaging.request(reminderCount, {
              status: "open",
            });
            return {
              status: asked.status,
              count: asked.status === "answered" ? asked.data.count : -1,
            };
          },
        }),
        defineTool({
          name: "remind-later",
          description: "Ask for a reminder later",
          input: z.object({ id: z.string() }),
          output: z.object({ sent: z.boolean() }),
          permission: "public",
          execute: async ({ input }) => {
            await messaging.command(remindLater, { id: input.id });
            return { sent: true };
          },
        }),
        defineTool({
          name: "ask-nobody",
          description: "Ask a question nobody answers",
          input: z.object({}),
          output: z.object({ status: z.string() }),
          permission: "public",
          execute: async () => ({
            status: (await messaging.request(unanswered, {})).status,
          }),
        }),
      ],
    },
  );
  const installed = await install(shell, definition);
  return { ...installed, heard, senders };
}

async function seed(shell: MockShell): Promise<void> {
  await Promise.all(
    [
      ["first", "open"],
      ["second", "open"],
      ["third", "done"],
    ].map(([id, status]) =>
      shell.getEntityService().createEntity({
        entity: {
          id: id ?? "",
          entityType: reminder.type,
          content: "A reminder",
          metadata: { status },
          // An answer reads at the package's own grant, public by default.
          visibility: "public",
        },
      }),
    ),
  );
}

async function callTool(
  installed: Installed,
  name: string,
  input: object,
): Promise<unknown> {
  const tool = installed.service.tools.find(
    (candidate) => candidate.name === `reminders_${name}`,
  );
  if (!tool) throw new Error(`No tool ${name}`);
  return tool.handler(input, admin);
}

describe("a service's subscriptions", () => {
  it("answer another package's request with what the package reads", async () => {
    const shell = createMockShell();
    const installed = await installReminders(shell);
    await seed(shell);

    const asker = createServicePluginContext(shell, "calendar");
    expect(
      await asker.messaging.request(reminderCount, { status: "open" }),
    ).toEqual({ status: "answered", data: { count: 2 } });
    // The handler is told which package asked.
    expect(installed.senders).toEqual(["calendar"]);
  });

  it("are told the sending package by the runtime, never by the request", async () => {
    const shell = createMockShell();
    const vouched = defineBusContract({
      channel: "@fixture/reminders:vouch",
      // A request may carry a field named like the sender; it stays data.
      request: z.object({ sender: z.string() }),
      response: z.object({ sender: z.string(), claimed: z.string() }),
      delivery: "request",
    });
    await install(
      shell,
      defineServicePlugin(
        { id: "reminders", config: z.object({}) },
        {
          subscriptions: ({ answer }) => [
            answer(vouched, ({ request, sender }) => ({
              sender,
              claimed: request.sender,
            })),
          ],
        },
      ),
    );

    const asker = createServicePluginContext(shell, "calendar");
    expect(
      await asker.messaging.request(vouched, { sender: "@brains/auth" }),
    ).toEqual({
      status: "answered",
      data: { sender: "calendar", claimed: "@brains/auth" },
    });
  });

  it("hear a command and write as the package, whoever sent it", async () => {
    const shell = createMockShell();
    const created = spyOn(shell.getEntityService(), "createEntity");
    const installed = await installReminders(shell);

    // Sent from inside one of the package's own tools: the answer still acts
    // as the package, since the bus carries a package, not a person.
    expect(await callTool(installed, "remind-later", { id: "soon" })).toEqual({
      success: true,
      data: { sent: true },
    });
    expect(installed.heard).toEqual(["soon"]);
    const written = created.mock.calls.find(
      ([request]) => request.entity.id === "soon",
    );
    expect(written?.[0].options?.eventContext).toEqual({
      actor: { kind: "service", serviceId: "@fixture/reminders:reminders" },
    });
  });

  it("are asked from a tool or a job with the slot's messaging", async () => {
    // The requester has an account, so the job it queues may run.
    const shell = createMockShell({
      resolvePrincipal: async (): Promise<CallerPrincipal | null> => ({
        userId: "usr_admin",
        permissionLevel: "admin",
      }),
    });
    const installed = await installReminders(shell);
    await seed(shell);

    expect(await callTool(installed, "count-open", {})).toEqual({
      success: true,
      data: { status: "answered", count: 2 },
    });
    expect(await callTool(installed, "ask-nobody", {})).toEqual({
      success: true,
      data: { status: "unavailable" },
    });

    const queued = z
      .object({ data: z.object({ jobId: z.string() }) })
      .parse(await callTool(installed, "queue-ask", {})).data.jobId;
    const queue = shell.getJobQueueService();
    const job = await queue.getStatus(queued);
    const handler = job ? queue.getHandler(job.type) : undefined;
    if (!job || !handler) throw new Error("The job was not queued");
    const data = handler.validateAndParse(JSON.parse(job.data));
    if (data === null) throw new Error("Job data was refused");
    expect(
      await handler.process(
        data,
        job.id,
        createMockProgressReporter(),
        new AbortController().signal,
      ),
    ).toEqual({ status: "answered" });
  });

  it("keep an SdkError's code for the asker, and refuse an answer outside the contract", async () => {
    const shell = createMockShell();
    const failing = defineServicePlugin(
      { id: "reminders", config: z.object({}) },
      {
        subscriptions: ({ answer }) => [
          answer(reminderCount, async ({ request }) => {
            if (request.status === "done") {
              throw new SdkError("not_found", {
                message: "no archive table",
                publicMessage: "No archive",
              });
            }
            return JSON.parse('{"count":"many"}');
          }),
        ],
      },
    );
    await install(shell, failing);
    const asker = createServicePluginContext(shell, "calendar");

    expect(
      await asker.messaging.request(reminderCount, { status: "done" }),
    ).toEqual({
      status: "failed",
      error: { code: "not_found", message: "No archive" },
    });
    expect(
      await asker.messaging.request(reminderCount, { status: "open" }),
    ).toEqual({
      status: "failed",
      error: { code: "invalid_response", message: "Invalid response" },
    });
  });

  it("are released when the package shuts down", async () => {
    const shell = createMockShell();
    const installed = await installReminders(shell);
    const service = installed.plugins.find(
      (plugin) => plugin.type === "service",
    );
    await service?.shutdown?.();

    const asker = createServicePluginContext(shell, "calendar");
    expect(
      await asker.messaging.request(reminderCount, { status: "open" }),
    ).toEqual({ status: "unavailable" });
  });

  it("refuse a channel answered twice, and a delivery no package may answer", async () => {
    const twice = defineServicePlugin(
      { id: "reminders", config: z.object({}) },
      {
        subscriptions: ({ answer }) => [
          answer(remindLater, async () => {}),
          answer(remindLater, async () => {}),
        ],
      },
    );
    expect(install(createMockShell(), twice)).rejects.toThrow(
      'Service "reminders" answers "reminders:remind-later" more than once',
    );

    // Built inside the brain, where gathering is declared.
    const gathered = defineInternalBusContract({
      channel: "reminders:gather",
      request: z.object({}),
      response: z.object({}),
      delivery: "collect",
    });
    const collecting = defineServicePlugin(
      { id: "reminders", config: z.object({}) },
      {
        subscriptions: ({ answer }) => [
          // @ts-expect-error -- a package answers requests and commands only
          answer(gathered, async () => ({})),
        ],
      },
    );
    expect(install(createMockShell(), collecting)).rejects.toThrow(
      'Service "reminders" cannot answer "reminders:gather": a package answers requests and commands only',
    );

    // A binding the slot's own answer did not make carries no handler.
    const forged = defineServicePlugin(
      { id: "reminders", config: z.object({}) },
      {
        subscriptions: () => [
          { kind: "rizom-service-subscription-binding", contract: remindLater },
        ],
      },
    );
    expect(install(createMockShell(), forged)).rejects.toThrow(
      'Service "reminders" returns a subscription its own answer did not bind',
    );
  });

  it("declare requests and commands only", () => {
    expect(() =>
      defineBusContract({
        channel: "reminders:gather",
        request: z.object({}),
        response: z.object({}),
        // @ts-expect-error -- gathering stays inside the brain
        delivery: "collect",
      }),
    ).toThrow(
      'Bus contract "reminders:gather" must be delivered as a "request" or a "command"',
    );
  });

  it("are refused in the header, where no behavior goes", () => {
    expect(() =>
      defineServicePlugin({
        id: "reminders",
        config: z.object({}),
        // @ts-expect-error -- behavior goes in the second argument
        subscriptions: () => [],
      }),
    ).toThrow();
  });
});
