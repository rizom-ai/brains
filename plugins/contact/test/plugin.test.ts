import { describe, expect, it, mock, spyOn, setSystemTime } from "bun:test";
import { createPluginHarness } from "@brains/plugins/test";
import type {
  ChannelDeliveryInput,
  ServicePluginContext,
  JobHandler,
} from "@brains/plugins";
import { CallbackProgressReporter } from "@brains/utils/progress";
import { NotificationsPlugin } from "@brains/notifications";
import { ContactPlugin, contactPlugin, contactRequestSchema } from "../src";
import {
  contactPluginConfigSchema,
  type ContactPluginConfig,
} from "../src/config";
import { admissionPolicy, input, peer } from "./intake-fixture";

type RecurringCheckDefinition = Parameters<
  ServicePluginContext["recurringChecks"]["register"]
>[0];
const origin = "https://brain.test";
const config: ContactPluginConfig = {
  intake: {
    http: { origin, maxBodyBytes: 20000, readTimeoutMs: 10000 },
    admission: admissionPolicy,
    storage: { retentionSeconds: 86400, maxRecords: 10, maxBytes: 100000 },
    delivery: { maxAttempts: 3, retryWindowSeconds: 3600 },
    inboxUrl: `${origin}/studio/workspaces/unified-inbox%3Ainbox`,
    preview: true,
  },
};
type Harness = ReturnType<typeof createPluginHarness>;
async function setup(executionOnly = false): Promise<{
  h: Harness;
  shell: ReturnType<Harness["getMockShell"]>;
  checks: RecurringCheckDefinition[];
  sent: ChannelDeliveryInput[];
  plugin: ContactPlugin;
  handlers: Map<string, JobHandler>;
}> {
  const h = createPluginHarness();
  const shell = h.getMockShell();
  const checks: RecurringCheckDefinition[] = [];
  const handlers = new Map<string, JobHandler>();
  spyOn(shell.getJobQueueService(), "registerHandler").mockImplementation(
    (type, handler) => {
      handlers.set(type, handler);
    },
  );
  spyOn(shell, "getRecurringChecks").mockReturnValue({
    register: (check) => {
      checks.push(check);
      return (): void => {};
    },
  });
  spyOn(shell, "getPluginPackageName").mockImplementation(
    (id) => `@brains/${id}`,
  );
  spyOn(shell, "getPluginWebRoutes").mockReturnValue([
    {
      pluginId: "studio",
      fullPath: "/studio/workspaces",
      definition: {
        path: "/studio/workspaces",
        method: "GET",
        match: "prefix",
        public: true,
        handler: (): Response => new Response(),
      },
    },
  ]);
  const [entityPlugin, plugin] = contactPlugin(config);
  await entityPlugin.register(shell);
  const sent: ChannelDeliveryInput[] = [];
  const channels = shell.getChannelRegistry();
  channels.registerDescriptor("test-email", {
    type: "email",
    displayName: "Email",
    subjectLabel: "Email address",
  });
  channels.registerDeliveryProvider("test-email", {
    channelType: "email",
    isAvailable: async () => true,
    send: async (message) => {
      sent.push(message);
      return { status: "sent" };
    },
  });
  channels.finalize();
  await new NotificationsPlugin({
    defaultRecipient: { type: "email", address: "owner@example.com" },
  }).register(shell, { executionOnly });
  await plugin.register(shell, { executionOnly });
  return { h, shell, checks, sent, plugin, handlers };
}
async function submit(plugin: ContactPlugin): Promise<Response> {
  const get = plugin
    .getWebRoutes()
    .find((route) => route.path === "/contact" && route.method === "GET");
  const post = plugin
    .getWebRoutes()
    .find((route) => route.path === "/contact" && route.method === "POST");
  if (!get || !post) throw new Error("Missing routes");
  const page = await get.handler(new Request(`${origin}/contact`), {
    remoteAddress: peer,
  });
  const token = (await page.text()).match(
    /name="token" value="([a-f0-9]+)"/,
  )?.[1];
  if (!token) throw new Error("Missing token");
  return post.handler(
    new Request(`${origin}/contact`, {
      method: "POST",
      headers: { origin },
      body: new URLSearchParams({ token, ...input }),
    }),
    { remoteAddress: peer },
  );
}

describe("contact runtime", () => {
  it("is default-off and requires complete explicit policy", () => {
    expect(new ContactPlugin().getWebRoutes()).toEqual([]);
    expect(() => contactPluginConfigSchema.parse({ intake: {} })).toThrow();
  });
  it("gates startup, saves/enqueues without sending inline, then executes a private generic notification", async () => {
    const f = await setup();
    const route = f.plugin.getWebRoutes()[0];
    expect(
      (
        await route?.handler(new Request(`${origin}/contact`), {
          remoteAddress: peer,
        })
      )?.status,
    ).toBe(503);
    await f.plugin.ready();
    expect((await submit(f.plugin)).status).toBe(303);
    expect(f.sent).toEqual([]);
    const queue = f.shell.getJobQueueService();
    const jobs = await queue.getActiveJobs();
    expect(jobs).toHaveLength(1);
    const job = jobs[0];
    if (!job) throw new Error("Missing job");
    const handler = f.handlers.get(job.type);
    if (!handler) throw new Error("Missing handler");
    const data = handler.validateAndParse(JSON.parse(job.data));
    expect(data).toEqual({ id: expect.stringMatching(/^contact-/) });
    expect(
      await handler.process(
        data,
        job.id,
        CallbackProgressReporter.noop(),
        new AbortController().signal,
      ),
    ).toBe("sent");
    expect(f.sent).toEqual([
      {
        recipient: "owner@example.com",
        subject: "New contact request",
        text: `A contact request is saved in your authenticated Inbox.\n\n${config.intake?.inboxUrl}`,
        sensitivity: "secret",
        idempotencyKey: expect.stringMatching(/^contact-notification:contact-/),
      },
    ]);
    expect(JSON.stringify(jobs)).not.toContain(input.email);
    expect(JSON.stringify(f.sent)).not.toContain(input.message);
    const records = await f.h.getEntityService().listEntities(
      {
        entityType: "contact-request",
        options: { filter: { visibilityScope: "restricted" } },
      },
      contactRequestSchema,
    );
    expect(records[0]?.metadata.notification).toBe("sent");
    expect(f.checks[0]?.cadence).toBe("daily");
    expect(f.plugin.getWebRoutes().every((r) => r.preview)).toBe(true);
    await f.plugin.shutdown?.();
    expect(
      (
        await route?.handler(new Request(`${origin}/contact`), {
          remoteAddress: peer,
        })
      )?.status,
    ).toBe(503);
  });
  it("closes stale or failed retention, retries cleanup, and makes old queued deliveries harmless", async () => {
    let f: Awaited<ReturnType<typeof setup>> | undefined;
    try {
      const start = Date.parse("2026-09-21T10:00:00.000Z");
      setSystemTime(new Date(start));
      f = await setup();
      await f.plugin.ready();
      expect((await submit(f.plugin)).status).toBe(303);
      const check = f.checks[0];
      const route = f.plugin.getWebRoutes()[0];
      if (!check || !route) throw new Error("Missing runtime surface");
      setSystemTime(new Date(start + 27 * 3600_000));
      expect(
        (
          await route.handler(new Request(`${origin}/contact`), {
            remoteAddress: peer,
          })
        ).status,
      ).toBe(503);
      const deletion = spyOn(
        f.h.getEntityService(),
        "deleteEntity",
      ).mockRejectedValue(new Error("PRIVATE"));
      expect(
        await check
          .run({ signal: new AbortController().signal })
          .catch((error: unknown) => error),
      ).toEqual(new Error("Contact maintenance unavailable"));
      expect(
        (await f.shell.getOperationalHealthRegistry().getChecks())[0]?.status,
      ).toBe("unhealthy");
      deletion.mockRestore();
      await check.run({ signal: new AbortController().signal });
      expect(
        (
          await route.handler(new Request(`${origin}/contact`), {
            remoteAddress: peer,
          })
        ).status,
      ).toBe(200);
      expect(
        await f.h
          .getEntityService()
          .listEntities(
            { entityType: "contact-request" },
            contactRequestSchema,
          ),
      ).toEqual([]);
      const job = (await f.shell.getJobQueueService().getActiveJobs())[0];
      if (!job) throw new Error("Missing saved delivery job");
      const handler = f.handlers.get(job.type);
      expect(
        await handler?.process(
          JSON.parse(job.data),
          job.id,
          CallbackProgressReporter.noop(),
          new AbortController().signal,
        ),
      ).toBe("skipped");
      expect(f.sent).toEqual([]);
    } finally {
      await f?.plugin.shutdown?.();
      setSystemTime();
    }
  });

  it("registers delivery handlers but no routes or recurring work in execution-only workers", async () => {
    const f = await setup(true);
    await f.plugin.ready();
    expect(f.plugin.getWebRoutes()).toEqual([]);
    expect(f.checks).toEqual([]);
    expect(f.handlers.has("contact:notify")).toBe(true);
    await f.plugin.shutdown?.();
  });
  it("fails closed on startup without the configured authenticated Inbox destination", async () => {
    const f = await setup();
    spyOn(f.shell, "getPluginWebRoutes").mockReturnValue([]);
    expect(await f.plugin.ready().catch((error: unknown) => error)).toEqual(
      new Error("Contact Inbox unavailable"),
    );
    await f.plugin.shutdown?.();
  });
  it("recovers enqueue failures on recurring maintenance and reports sanitized health", async () => {
    const f = await setup();
    await f.plugin.ready();
    const queue = f.shell.getJobQueueService();
    const enqueue = spyOn(queue, "enqueue").mockRejectedValue(
      new Error(`PRIVATE ${input.email}`),
    );
    expect((await submit(f.plugin)).status).toBe(303);
    const check = f.checks[0];
    if (!check) throw new Error("Missing maintenance");
    await check.run({ signal: new AbortController().signal });
    const health = await f.shell.getOperationalHealthRegistry().getChecks();
    expect(health[0]?.status).toBe("degraded");
    expect(JSON.stringify(health)).not.toContain(input.email);
    enqueue.mockRestore();
    await check.run({ signal: new AbortController().signal });
    expect(await queue.getActiveJobs()).toHaveLength(1);
    const remove = mock(async () => {});
    await f.plugin.shutdown?.();
    expect(
      await check
        .run({ signal: new AbortController().signal })
        .then(remove)
        .catch((error: unknown) => error),
    ).toBeInstanceOf(Error);
    expect(remove).not.toHaveBeenCalled();
  });
});
