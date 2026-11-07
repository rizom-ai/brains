// Staged as reminders.test.ts beside the reminders fixture's source, with the
// public entries mapped to this repository's, until @rizom/brain/testing
// carries the same scenarios to packed consumers.
import { describe, expect, it } from "bun:test";
import type { CallerPrincipal } from "@brains/content-service";
import {
  createServicePluginContext,
  instantiatePluginPackageDefinition,
  type Plugin,
  type PluginCapabilities,
  type ToolContext,
} from "@brains/plugins";
import { createMockShell, type MockShell } from "@brains/plugins/test";
import { createMockProgressReporter } from "@brains/test-utils";
import { z } from "@brains/utils/zod";
import reminders, { dueCount, reminder } from "./src/index";

const past = "2000-01-01T00:00:00.000Z";
const later = "2999-01-01T00:00:00.000Z";

const admin: ToolContext = {
  interfaceType: "mcp",
  actor: { kind: "user", userId: "usr_admin" },
  userPermissionLevel: "admin",
};

interface Installed {
  readonly shell: MockShell;
  readonly service: Plugin;
  readonly capabilities: PluginCapabilities;
}

async function install(): Promise<Installed> {
  // The requester has an account, so the jobs it queues may run.
  const shell = createMockShell({
    resolvePrincipal: async (): Promise<CallerPrincipal | null> => ({
      userId: "usr_admin",
      permissionLevel: "admin",
    }),
  });
  const plugins = instantiatePluginPackageDefinition(
    reminders,
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
  if (!service) throw new Error("The reminders package has no service");
  return { shell, service: service.plugin, capabilities: service.capabilities };
}

async function call(
  { capabilities }: Installed,
  name: string,
  input: object,
): Promise<unknown> {
  const tool = capabilities.tools.find(
    (candidate) => candidate.name === `reminders_${name}`,
  );
  if (!tool) throw new Error(`No tool ${name}`);
  return tool.handler(input, admin);
}

async function seed(shell: MockShell): Promise<void> {
  for (const [id, done] of [
    ["due", false],
    ["done", true],
    ["upcoming", false],
  ] as const) {
    await shell.getEntityService().createEntity({
      entity: {
        id,
        entityType: reminder.type,
        content: `Reminder ${id}`,
        metadata: { dueAt: id === "upcoming" ? later : past, done },
        visibility: "public",
      },
    });
  }
}

/** Run the job a tool queued, as the brain's worker would. */
async function runQueued(
  shell: MockShell,
  response: unknown,
): Promise<unknown> {
  const jobId = z
    .object({ data: z.object({ jobId: z.string() }) })
    .parse(response).data.jobId;
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

describe("the reminders package", () => {
  it("adds a reminder as owned, typed content", async () => {
    const installed = await install();

    expect(
      await call(installed, "add", {
        id: "call",
        content: "Call Sam",
        dueAt: past,
      }),
    ).toEqual({ success: true, data: { id: "call" } });
    const stored = await installed.shell.getEntityService().getEntity({
      entityType: reminder.type,
      id: "call",
      visibilityScope: "restricted",
    });
    expect(stored?.content).toBe("Call Sam");
    expect(stored?.metadata).toEqual({ dueAt: past, done: false });
  });

  it("agrees on what is due through its tool, contract and route", async () => {
    const installed = await install();
    await seed(installed.shell);
    const now = new Date().toISOString();

    expect(await call(installed, "list-due", { now })).toEqual({
      success: true,
      data: { ids: ["due"] },
    });
    const asker = createServicePluginContext(installed.shell, "calendar");
    expect(await asker.messaging.request(dueCount, { now })).toEqual({
      status: "answered",
      data: { count: 1 },
    });
    const route = installed.service
      .getWebRoutes?.()
      .find((candidate) => candidate.path === "/reminders/due");
    if (!route) throw new Error("The due route is not served");
    const answer = await route.handler(
      new Request("http://brain/reminders/due"),
    );
    expect(answer.status).toBe(200);
    expect(await answer.json()).toEqual({ ids: ["due"] });
  });

  it("delivers a reminder once, counting deliveries in its own state", async () => {
    const installed = await install();
    await seed(installed.shell);

    expect(
      await runQueued(
        installed.shell,
        await call(installed, "fire", { id: "due" }),
      ),
    ).toEqual({ fired: true, total: 1, text: "Reminder due" });
    expect(
      await runQueued(
        installed.shell,
        await call(installed, "fire", { id: "due" }),
      ),
    ).toEqual({ fired: false, total: 1, text: "Reminder due" });
    const delivered = await installed.shell.getEntityService().getEntity({
      entityType: reminder.type,
      id: "due",
    });
    expect(delivered?.metadata).toEqual({ dueAt: past, done: true });
  });

  it("fails to deliver a missing reminder with its code", async () => {
    const installed = await install();

    const failure: unknown = await runQueued(
      installed.shell,
      await call(installed, "fire", { id: "missing" }),
    ).catch((error: unknown) => error);
    expect(failure).toMatchObject({ code: "not_found" });
  });
});
