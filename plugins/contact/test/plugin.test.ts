import { describe, expect, it, mock, spyOn, setSystemTime } from "bun:test";
import { createPluginHarness } from "@brains/plugins/test";
import { SITE_BUILDER_CHANNELS } from "@brains/contracts";
import { renderToStaticMarkup } from "react-dom/server";
import type {
  ChannelDeliveryInput,
  ServicePluginContext,
  JobHandler,
} from "@brains/plugins";
import { CallbackProgressReporter } from "@brains/utils/progress";
import { NotificationsPlugin } from "@brains/notifications";
import {
  SITE_METADATA_GET_CHANNEL,
  SITE_METADATA_UPDATED_CHANNEL,
} from "@brains/site-composition";
import { ContactPlugin, contactPlugin, contactRequestSchema } from "../src";
import type { ContactPluginConfig } from "../src/config";
import { admissionPolicy, input, peer } from "./intake-fixture";

type RecurringCheckDefinition = Parameters<
  ServicePluginContext["recurringChecks"]["register"]
>[0];
// The brain's domain gives the intake its origin; the tests tighten the
// policy's limits to the fixture's small ones.
const origin = "https://brain.test";
const inboxUrl = `${origin}/studio/workspaces/unified-inbox%3Ainbox`;
const config: ContactPluginConfig = {
  intake: {
    admission: admissionPolicy,
    storage: { maxRecords: 10, maxBytes: 100000 },
  },
};
type Harness = ReturnType<typeof createPluginHarness>;
/** One brain process. A worker shares the web process's runtime state, as the
 * deployed web and worker processes share their runtime database. */
async function setup(
  executionOnly = false,
  sharesStateWith?: Harness,
  brain: Parameters<typeof createPluginHarness>[0] = { domain: "brain.test" },
): Promise<{
  h: Harness;
  shell: ReturnType<Harness["getMockShell"]>;
  checks: RecurringCheckDefinition[];
  sent: ChannelDeliveryInput[];
  /** What the owner's email transport answers; switch to fail an alert. */
  transport: { status: "sent" | "failed" };
  plugin: ContactPlugin;
  handlers: Map<string, JobHandler>;
}> {
  const h = createPluginHarness(brain);
  const shell = h.getMockShell();
  if (sharesStateWith)
    spyOn(shell, "getRuntimeState").mockReturnValue(
      sharesStateWith.getMockShell().getRuntimeState(),
    );
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
  const transport: { status: "sent" | "failed" } = { status: "sent" };
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
      if (transport.status === "failed")
        return { status: "failed", failureCode: "test-transport" };
      sent.push(message);
      return { status: "sent" };
    },
  });
  channels.finalize();
  await new NotificationsPlugin({
    defaultRecipient: { type: "email", address: "owner@example.com" },
  }).register(shell, { executionOnly });
  await plugin.register(shell, { executionOnly });
  return { h, shell, checks, sent, transport, plugin, handlers };
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
  it("serves nothing before it registers, and needs no configuration once it has", async () => {
    expect(new ContactPlugin().getWebRoutes()).toEqual([]);
    const h = createPluginHarness({ domain: "brain.test" });
    const plugin = new ContactPlugin();
    await plugin.register(h.getMockShell());
    expect(
      plugin.getWebRoutes().map((route) => `${route.method} ${route.path}`),
    ).toEqual(["GET /contact", "POST /contact", "GET /contact/thanks"]);
    await plugin.shutdown();
  });
  it("takes the brain's local site URL while the brain prefers local URLs", async () => {
    const f = await setup(false, undefined, {
      localSiteUrl: "http://localhost:8080",
      preferLocalUrls: true,
    });
    await f.plugin.ready();
    const get = f.plugin
      .getWebRoutes()
      .find((route) => route.path === "/contact" && route.method === "GET");
    const status = async (url: string): Promise<number | undefined> =>
      (await get?.handler(new Request(url), { remoteAddress: "127.0.0.1" }))
        ?.status;
    expect(await status("http://localhost:8080/contact")).toBe(200);
    // And the webserver's local preview host beside it.
    expect(await status("http://preview.localhost:8080/contact")).toBe(200);
    expect(await status("https://brain.test/contact")).toBe(403);
    await f.plugin.shutdown();
  });
  it("refuses to register on a brain that has no site URL", async () => {
    const h = createPluginHarness({});
    expect(
      await new ContactPlugin()
        .register(h.getMockShell())
        .catch((error: unknown) => error),
    ).toEqual(new Error("Contact intake needs the brain's site URL"));
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
        text: `A contact request is saved in your authenticated Inbox.\n\n${inboxUrl}`,
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
    await f.plugin.shutdown();
    expect(
      (
        await route?.handler(new Request(`${origin}/contact`), {
          remoteAddress: peer,
        })
      )?.status,
    ).toBe(503);
  });
  it("opens the form in the site's own theme and follows changes to it", async () => {
    const f = await setup();
    const bus = f.shell.getMessageBus();
    const site = { title: "Brain", description: "A site" };
    bus.subscribe(SITE_METADATA_GET_CHANNEL, async () => ({
      success: true,
      data: { ...site, themeMode: "light" },
    }));
    await f.plugin.ready();
    const get = f.plugin
      .getWebRoutes()
      .find((route) => route.path === "/contact" && route.method === "GET");
    if (!get) throw new Error("Missing form route");
    const theme = async (): Promise<string | undefined> =>
      /<html lang="en" data-theme="(\w+)">/.exec(
        await (
          await get.handler(new Request(`${origin}/contact`), {
            remoteAddress: peer,
          })
        ).text(),
      )?.[1];

    expect(await theme()).toBe("light");
    await bus.send({
      type: SITE_METADATA_UPDATED_CHANNEL,
      payload: { ...site, themeMode: "dark" },
      sender: "site-info",
      broadcast: true,
    });
    expect(await theme()).toBe("dark");
    await f.plugin.shutdown();
  });

  it("serves the deployment's preview host beside its origin", async () => {
    const f = await setup();
    await f.plugin.ready();
    const get = f.plugin
      .getWebRoutes()
      .find((route) => route.path === "/contact" && route.method === "GET");
    const response = await get?.handler(
      new Request("https://preview.brain.test/contact"),
      { remoteAddress: peer },
    );
    expect(response?.status).toBe(200);
    await f.plugin.shutdown();
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
      await f?.plugin.shutdown();
      setSystemTime();
    }
  });

  it("in a separate worker, declares the form for site builds and runs maintenance, but never serves", async () => {
    const f = await setup(true);
    await f.plugin.ready();
    const routes = f.plugin.getWebRoutes();
    expect(routes.map((route) => `${route.method} ${route.path}`)).toEqual([
      "GET /contact",
      "POST /contact",
      "GET /contact/thanks",
    ]);
    expect(routes.every((route) => route.public && route.preview)).toBe(true);
    const response = await routes[0]?.handler(
      new Request(`${origin}/contact`),
      {
        remoteAddress: peer,
      },
    );
    expect(response?.status).toBe(503);
    expect(f.checks.map((check) => check.id)).toEqual(["maintenance"]);
    expect(f.handlers.has("contact:notify")).toBe(true);
    await f.plugin.shutdown();
  });

  it("keeps the form open while a separate worker runs its daily maintenance", async () => {
    const web = await setup();
    const worker = await setup(true, web.h);
    await web.plugin.ready();
    await worker.plugin.ready();
    const hour = 60 * 60 * 1000;
    try {
      setSystemTime(new Date(Date.now() + 24 * hour));
      const maintenance = worker.checks[0];
      if (!maintenance) throw new Error("Missing maintenance");
      await maintenance.run({ signal: new AbortController().signal });
      // 27 hours after the web process last maintained, 3 after the worker did.
      setSystemTime(new Date(Date.now() + 3 * hour));
      expect((await submit(web.plugin)).status).toBe(303);
    } finally {
      setSystemTime();
      await worker.plugin.shutdown();
      await web.plugin.shutdown();
    }
  });
  it("fails closed on startup without the configured authenticated Inbox destination", async () => {
    const f = await setup();
    spyOn(f.shell, "getPluginWebRoutes").mockReturnValue([]);
    expect(await f.plugin.ready().catch((error: unknown) => error)).toEqual(
      new Error("Contact Inbox unavailable"),
    );
    await f.plugin.shutdown();
  });
  it("reports a failed alert as degraded until its request is marked Done", async () => {
    const f = await setup();
    f.transport.status = "failed";
    await f.plugin.ready();
    expect((await submit(f.plugin)).status).toBe(303);
    const job = (await f.shell.getJobQueueService().getActiveJobs())[0];
    const handler = job && f.handlers.get(job.type);
    if (!job || !handler) throw new Error("Missing delivery job");
    const attempt = (): Promise<unknown> =>
      handler
        .process(
          JSON.parse(job.data),
          job.id,
          CallbackProgressReporter.noop(),
          new AbortController().signal,
        )
        .catch((error: unknown) => error);
    const unavailable = new Error("Contact notification unavailable");
    expect(await attempt()).toEqual(unavailable);
    expect(await attempt()).toEqual(unavailable);
    expect(await attempt()).toBe("failed");
    const intake = async (): Promise<unknown> =>
      (await f.shell.getOperationalHealthRegistry().getChecks())[0];
    expect(await intake()).toMatchObject({
      status: "degraded",
      details: {
        failed: 1,
        failedUnhandled: 1,
        failures: { "test-transport": 1 },
      },
    });

    const registry = f.shell.getInboxRegistry();
    registry.finalize();
    const inbox = registry.getSource("contact-requests");
    const [request] = (await inbox?.list()) ?? [];
    if (!inbox || !request) throw new Error("Missing Inbox request");
    await inbox.act(request.id, "mark-handled", { permissionLevel: "admin" });

    expect(await intake()).toMatchObject({
      status: "healthy",
      details: {
        failed: 1,
        failedUnhandled: 0,
        failures: { "test-transport": 1 },
      },
    });
    await f.plugin.shutdown();
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
    await f.plugin.shutdown();
    expect(
      await check
        .run({ signal: new AbortController().signal })
        .then(remove)
        .catch((error: unknown) => error),
    ).toBeInstanceOf(Error);
    expect(remove).not.toHaveBeenCalled();
  });
});

describe("the contact page in the site", () => {
  it("gives the site a /contact page with a slot for the form, and its thanks page", async () => {
    const f = await setup();
    const registered: unknown[] = [];
    f.h.subscribe(SITE_BUILDER_CHANNELS.routeRegister, async (message) => {
      registered.push(message.payload);
      return { success: true };
    });
    await f.plugin.ready();
    const component = f.h.getTemplates().get("contact:page")?.layout?.component;
    if (!component) throw new Error("Missing contact:page template");
    expect(renderToStaticMarkup(component({}))).toBe(
      '<div data-site-slot="contact"></div>',
    );
    const page = (id: string, path: string, title: string): unknown => ({
      id,
      path,
      title,
      sections: [{ id: "form", template: "contact:page", content: {} }],
      navigation: { show: false },
    });
    expect(registered).toEqual([
      {
        pluginId: "contact",
        routes: [
          page("contact", "/contact", "Contact"),
          page("contact-thanks", "/contact/thanks", "Note saved"),
        ],
      },
    ]);
  });
});
