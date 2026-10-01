import { describe, expect, it, mock, spyOn, setSystemTime } from "bun:test";
import { createPluginHarness } from "@brains/plugins/test";
import type { ChannelDeliveryInput, JobHandler } from "@brains/plugins";
import { instantiatePluginPackageDefinition } from "@brains/plugins";
import {
  inboxWorkspaceRequest,
  contactFormDiscoveryRequest,
  NOTIFICATIONS_SEND,
  SITE_BUILDER_CHANNELS,
} from "@brains/contracts";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { instantiate } from "./helpers";
import { CallbackProgressReporter } from "@brains/utils/progress";
import {
  SITE_METADATA_GET_CHANNEL,
  SITE_METADATA_UPDATED_CHANNEL,
} from "@brains/site-composition";
import notificationsPackage from "@brains/notifications";
import { contactRequestSchema } from "../src";
type ContactService = ReturnType<typeof instantiate>["service"];
import {
  contactPluginConfigSchema,
  type ContactPluginConfig,
} from "../src/config";
import { admissionPolicy, input, peer } from "./intake-fixture";
import { maintenanceStatusSchema } from "../src/runtime";

type MaintenanceDefinition = Omit<RecurringCheckDefinition, "run"> & {
  run(): Promise<unknown>;
};
const origin = "https://brain.test";
const config: ContactPluginConfig = {
  intake: {
    http: { origin, maxBodyBytes: 20000, readTimeoutMs: 10000 },
    admission: admissionPolicy,
    storage: { retentionSeconds: 86400, maxRecords: 10, maxBytes: 100000 },
    delivery: { maxAttempts: 3, retryWindowSeconds: 3600 },
    inboxUrl: `${origin}/studio/workspaces/%40brains%2Funified-inbox%3Ainbox`,
    preview: true,
  },
};
type Harness = ReturnType<typeof createPluginHarness>;
type RecurringCheckDefinition = Parameters<
  ReturnType<
    ReturnType<Harness["getMockShell"]>["getRecurringChecks"]
  >["register"]
>[0];
async function setup(
  executionOnly = false,
  sharesStateWith?: Harness,
): Promise<{
  h: Harness;
  shell: ReturnType<Harness["getMockShell"]>;
  checks: MaintenanceDefinition[];
  recurring: RecurringCheckDefinition[];
  sent: ChannelDeliveryInput[];
  transport: { status: "sent" | "failed"; failureCode: string };
  plugin: ContactService;
  handlers: Map<string, JobHandler>;
  inbox: { href: string | undefined };
}> {
  // The deployment domain gives the runtime its site and preview URLs.
  const h = createPluginHarness({ domain: "brain.test" });
  const shell = h.getMockShell();
  if (sharesStateWith) {
    spyOn(shell, "getRuntimeState").mockReturnValue(
      sharesStateWith.getMockShell().getRuntimeState(),
    );
    spyOn(shell, "getEntityService").mockReturnValue(
      sharesStateWith.getEntityService(),
    );
  }
  const recurring: RecurringCheckDefinition[] = [];
  const checks: MaintenanceDefinition[] = [];
  const handlers = new Map<string, JobHandler>();
  spyOn(shell.getJobQueueService(), "registerHandler").mockImplementation(
    (type, handler) => {
      handlers.set(type, handler);
    },
  );
  spyOn(shell, "getRecurringChecks").mockReturnValue({
    register: mock((check: RecurringCheckDefinition): (() => void) => {
      recurring.push(check);
      checks.push({
        ...check,
        run: () => check.run({ signal: new AbortController().signal }),
      });
      return (): void => {};
    }),
  });
  const { entity: entityPlugin, service: plugin } = instantiate(config);
  const inbox = {
    href: config.intake ? new URL(config.intake.inboxUrl).pathname : undefined,
  };
  shell.getMessageBus().subscribe(inboxWorkspaceRequest.topic, async () => ({
    success: true,
    data: inbox,
  }));
  await entityPlugin.register(shell);
  const sent: ChannelDeliveryInput[] = [];
  const transport: { status: "sent" | "failed"; failureCode: string } = {
    status: "sent",
    failureCode: "test-transport",
  };
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
        return { status: "failed", failureCode: transport.failureCode };
      sent.push(message);
      return { status: "sent" };
    },
  });
  channels.finalize();
  for (const notification of instantiatePluginPackageDefinition(
    notificationsPackage,
    {
      defaultRecipient: { type: "email", address: "owner@example.com" },
    },
    { name: "@brains/notifications", version: "0.0.0-test" },
  )) {
    await notification.register(shell, { executionOnly });
  }
  await plugin.register(shell, { executionOnly });
  await plugin.finalizeRegistration();
  return {
    h,
    shell,
    checks,
    recurring,
    sent,
    transport,
    plugin,
    handlers,
    inbox,
  };
}
async function submit(plugin: ContactService): Promise<Response> {
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
  it("is default-off and requires complete explicit policy", async () => {
    const h = createPluginHarness();
    const { entity, service } = instantiate();
    try {
      await h.installPlugin(entity);
      await h.installPlugin(service);
      expect(service.getWebRoutes()).toEqual([]);
      expect(() => contactPluginConfigSchema.parse({ intake: {} })).toThrow();
    } finally {
      await h.reset();
    }
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
    expect(JSON.parse(job.data)).toEqual({
      id: expect.stringMatching(/^contact-/),
    });
    expect(data).not.toBeNull();
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
    expect(f.checks[0]?.deliverAlerts).toBe(false);
    expect(f.checks[0]?.includeInInbox).toBe(false);
    expect(
      f.shell.getRecurringChecks("@brains/contact:contact").register,
    ).toHaveBeenCalledTimes(1);
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
  it("reads and escapes the current owner name through declarative identity", async () => {
    const f = await setup();
    const profile = f.shell.getProfile();
    let name = "First owner";
    const identity = spyOn(f.shell, "getProfile").mockImplementation(() => ({
      ...profile,
      name,
    }));
    try {
      await f.plugin.ready();
      const get = f.plugin
        .getWebRoutes()
        .find((route) => route.path === "/contact" && route.method === "GET");
      const first = await get?.handler(new Request(`${origin}/contact`), {
        remoteAddress: peer,
      });
      expect(await first?.text()).toContain("Write to First owner");
      name = "<script>changed owner</script>";
      const changed = await get?.handler(new Request(`${origin}/contact`), {
        remoteAddress: peer,
      });
      const html = await changed?.text();
      expect(html).toContain(
        "Write to &lt;script&gt;changed owner&lt;/script&gt;",
      );
      expect(html).not.toContain(name);
    } finally {
      identity.mockRestore();
      await f.plugin.shutdown();
      await f.h.reset();
    }
  });
  it("reads only the site's theme through declarative messaging and follows updates", async () => {
    const f = await setup();
    try {
      const bus = f.shell.getMessageBus();
      bus.subscribe(SITE_METADATA_GET_CHANNEL, async (message) => {
        expect(message.payload).toEqual({});
        return { success: true, data: { title: "Brain", themeMode: "light" } };
      });
      await f.plugin.ready();
      const get = f.plugin
        .getWebRoutes()
        .find((route) => route.path === "/contact" && route.method === "GET");
      if (!get) throw new Error("Missing form route");
      const theme = async (query = ""): Promise<string | undefined> =>
        /<html lang="en" data-theme="(\w+)">/.exec(
          await (
            await get.handler(new Request(`${origin}/contact${query}`), {
              remoteAddress: peer,
            })
          ).text(),
        )?.[1];
      expect(await theme()).toBe("light");
      await bus.send({
        type: SITE_METADATA_UPDATED_CHANNEL,
        payload: { themeMode: "dark", title: "Brain" },
        sender: "site-info",
        broadcast: true,
      });
      expect(await theme()).toBe("dark");
      expect(await theme("?theme=light")).toBe("light");
      await bus.send({
        type: SITE_METADATA_UPDATED_CHANNEL,
        payload: { themeMode: "light" },
        sender: "site-info",
        broadcast: true,
      });
      expect(await theme()).toBe("light");
      await bus.send({
        type: SITE_METADATA_UPDATED_CHANNEL,
        payload: { themeMode: "<script>" },
        sender: "site-info",
        broadcast: true,
      });
      expect(await theme()).toBe("dark");
    } finally {
      await f.plugin.shutdown();
      await f.h.reset();
    }
  });

  it("does not read or subscribe to presentation metadata in a worker", async () => {
    const f = await setup(true);
    try {
      let reads = 0;
      const bus = f.shell.getMessageBus();
      bus.subscribe(SITE_METADATA_GET_CHANNEL, async () => {
        reads++;
        return { success: true, data: { themeMode: "light" } };
      });
      await f.plugin.ready();
      expect(reads).toBe(0);
      expect(bus.hasHandlers?.(SITE_METADATA_UPDATED_CHANNEL)).toBe(false);
    } finally {
      await f.plugin.shutdown();
      await f.h.reset();
    }
  });

  it("serves the deployment's preview host when preview is on", async () => {
    const f = await setup();
    try {
      await f.plugin.ready();
      const get = f.plugin
        .getWebRoutes()
        .find((route) => route.path === "/contact" && route.method === "GET");
      const response = await get?.handler(
        new Request("https://preview.brain.test/contact"),
        { remoteAddress: peer },
      );
      expect(response?.status).toBe(200);
    } finally {
      await f.plugin.shutdown();
      await f.h.reset();
    }
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
      expect(await check.run().catch((error: unknown) => error)).toEqual(
        new Error("Contact maintenance unavailable"),
      );
      expect(
        (await f.shell.getOperationalHealthRegistry().getChecks())[0]?.status,
      ).toBe("unhealthy");
      deletion.mockRestore();
      await check.run();
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
          handler.validateAndParse(JSON.parse(job.data)),
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

  it("registers worker maintenance and metadata but no HTTP handlers or local timers", async () => {
    const f = await setup(true);
    await f.plugin.ready();
    expect(f.plugin.getWebRoutes()).toEqual([]);
    expect(f.checks).toHaveLength(1);
    expect(
      f.shell.getRecurringChecks("@brains/contact:contact").register,
    ).toHaveBeenCalled();
    expect(f.recurring.map((check) => check.id)).toEqual(["maintenance"]);
    const discovery = await f.shell.getMessageBus().send({
      type: contactFormDiscoveryRequest.topic,
      sender: "test",
      payload: {},
    });
    expect(discovery).toMatchObject({
      success: true,
      data: {
        origin,
        routes: [
          { path: "/contact", method: "GET", public: true, preview: true },
          { path: "/contact", method: "POST", public: true, preview: true },
          {
            path: "/contact/thanks",
            method: "GET",
            public: true,
            preview: true,
          },
        ],
      },
    });
    expect(f.handlers.has("@brains/contact:contact:notify")).toBe(true);
    const result = await f.shell.getMessageBus().send({
      type: NOTIFICATIONS_SEND,
      sender: "@brains/contact:contact",
      payload: {
        title: "New contact request",
        body: "A request is saved in your Inbox.",
        sensitivity: "secret",
      },
    });
    expect(result).toMatchObject({ success: true, data: { status: "sent" } });
    expect(f.sent).toHaveLength(1);
    await f.plugin.shutdown();
  });
  it("keeps web intake open after a separate worker maintains shared state", async () => {
    const web = await setup();
    const worker = await setup(true, web.h);
    try {
      await web.plugin.ready();
      await worker.plugin.ready();
      const hour = 60 * 60 * 1000;
      setSystemTime(new Date(Date.now() + 24 * hour));
      const maintenance = worker.recurring[0];
      if (!maintenance) throw new Error("Missing worker maintenance");
      await maintenance.run({ signal: new AbortController().signal });
      setSystemTime(new Date(Date.now() + 3 * hour));
      expect((await submit(web.plugin)).status).toBe(303);
      expect(worker.plugin.getWebRoutes()).toEqual([]);
    } finally {
      setSystemTime();
      await worker.plugin.shutdown();
      await web.plugin.shutdown();
      await worker.h.reset();
      await web.h.reset();
    }
  });
  it("closes web intake when worker maintenance fails, without exposing stored details", async () => {
    const web = await setup();
    const worker = await setup(true, web.h);
    try {
      await web.plugin.ready();
      expect((await submit(web.plugin)).status).toBe(303);
      const read = spyOn(
        worker.shell.getEntityService(),
        "getEntity",
      ).mockRejectedValue(new Error(`PRIVATE ${input.email}`));
      const maintenance = worker.recurring[0];
      if (!maintenance) throw new Error("Missing maintenance");
      expect(
        await maintenance
          .run({ signal: new AbortController().signal })
          .catch((error: unknown) => error),
      ).toEqual(new Error("Contact maintenance unavailable"));
      read.mockRestore();
      const route = web.plugin
        .getWebRoutes()
        .find((route) => route.method === "GET");
      const response = await route?.handler(new Request(`${origin}/contact`), {
        remoteAddress: peer,
      });
      expect(response?.status).toBe(503);
      expect(await response?.text()).not.toContain(input.email);
    } finally {
      await worker.plugin.shutdown();
      await web.plugin.shutdown();
      await worker.h.reset();
      await web.h.reset();
    }
  });
  it("rejects missing, failed, future and stale shared freshness", async () => {
    const f = await setup();
    try {
      await f.plugin.ready();
      const status = f.shell.getRuntimeState().scoped({
        namespace: "brains.contact.contact.maintenance",
        schema: maintenanceStatusSchema,
      });
      expect(await status.get("status")).toMatchObject({ failed: false });
      const route = f.plugin
        .getWebRoutes()
        .find((route) => route.method === "GET");
      for (const value of [
        null,
        { at: Date.now(), failed: true },
        { at: Date.now() + 60000, failed: false },
        { at: Date.now() - 27 * 3600000, failed: false },
      ]) {
        if (value) await status.set("status", value);
        else await status.delete("status");
        expect(
          (
            await route?.handler(new Request(`${origin}/contact`), {
              remoteAddress: peer,
            })
          )?.status,
        ).toBe(503);
      }
    } finally {
      await f.plugin.shutdown();
      await f.h.reset();
    }
  });
  it.each([
    undefined,
    "https://other.test/studio/inbox",
    "/studio/elsewhere",
    "http://]",
  ])(
    "fails closed on an unavailable or mismatched Inbox destination: %s",
    async (href) => {
      const f = await setup();
      f.inbox.href = href;
      expect(await f.plugin.ready().catch((error: unknown) => error)).toEqual(
        new Error("Contact Inbox unavailable"),
      );
      await f.plugin.shutdown();
    },
  );
  it("drains an in-flight retention read before shutdown completes", async () => {
    const f = await setup();
    const started = Promise.withResolvers<void>();
    const release = Promise.withResolvers<void>();
    try {
      await f.plugin.ready();
      expect((await submit(f.plugin)).status).toBe(303);
      const entities = f.h.getEntityService();
      const [record] = await entities.listEntities(
        {
          entityType: "contact-request",
          options: { filter: { visibilityScope: "restricted" } },
        },
        contactRequestSchema,
      );
      if (!record || !f.checks[0])
        throw new Error("Missing saved request or maintenance");
      spyOn(entities, "getEntity").mockImplementation(async () => {
        started.resolve();
        await release.promise;
        return record;
      });
      const cycle = f.checks[0].run().catch((error: unknown) => error);
      await started.promise;
      let stopped = false;
      const shutdown = f.plugin.shutdown().then(() => {
        stopped = true;
      });
      await Promise.resolve();
      expect(stopped).toBe(false);
      release.resolve();
      await shutdown;
      expect(stopped).toBe(true);
      expect(await cycle).toEqual(new Error("Contact maintenance unavailable"));
      expect(f.sent).toEqual([]);
    } finally {
      release.resolve();
      await f.plugin.shutdown();
    }
  });

  it.each([
    ["test-transport", "test-transport"],
    ["constructor", "constructor"],
    ["__proto__", "__proto__"],
    [`PRIVATE ${input.email}`, "delivery-failed"],
  ])(
    "reports only bounded alert reasons until Done (%s)",
    async (failureCode, expectedCode) => {
      const f = await setup();
      try {
        f.transport.status = "failed";
        f.transport.failureCode = failureCode;
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
        expect(await attempt()).toEqual(
          new Error("Contact notification unavailable"),
        );
        expect(await attempt()).toEqual(
          new Error("Contact notification unavailable"),
        );
        expect(await attempt()).toBe("failed");
        const intake = async (): Promise<unknown> =>
          (await f.shell.getOperationalHealthRegistry().getChecks())[0];
        expect(await intake()).toMatchObject({
          status: "degraded",
          details: {
            failed: 1,
            failedUnhandled: 1,
            failures: { [expectedCode]: 1 },
          },
        });
        const registry = f.shell.getInboxRegistry();
        registry.finalize();
        const inbox = registry.getSource("contact-requests");
        const [request] = (await inbox?.list()) ?? [];
        if (!inbox || !request) throw new Error("Missing Inbox request");
        await inbox.act(request.id, "mark-handled", {
          permissionLevel: "admin",
        });
        expect(await intake()).toMatchObject({
          status: "healthy",
          details: {
            failed: 1,
            failedUnhandled: 0,
            failures: { [expectedCode]: 1 },
          },
        });
      } finally {
        await f.plugin.shutdown();
        await f.h.reset();
      }
    },
  );

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
    await check.run();
    const health = await f.shell.getOperationalHealthRegistry().getChecks();
    expect(health[0]?.status).toBe("degraded");
    expect(JSON.stringify(health)).not.toContain(input.email);
    enqueue.mockRestore();
    await check.run();
    expect(await queue.getActiveJobs()).toHaveLength(1);
    const remove = mock(async () => {});
    await f.plugin.shutdown();
    expect(
      await check
        .run()
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
    const component = f.h.getTemplates().get("@brains/contact:contact:page")
      ?.layout?.component;
    if (!component) throw new Error("Missing contact page template");
    expect(renderToStaticMarkup(createElement(component, {}))).toBe(
      '<div data-site-slot="contact"></div>',
    );
    const page = (id: string, path: string, title: string): unknown => ({
      id,
      path,
      title,
      sections: [
        { id: "form", template: "@brains/contact:contact:page", content: {} },
      ],
      navigation: { show: false },
    });
    expect(registered).toEqual([
      {
        pluginId: "@brains/contact:contact",
        routes: [
          page("contact", "/contact", "Contact"),
          page("contact-thanks", "/contact/thanks", "Note saved"),
        ],
      },
    ]);
  });

  it("replays page contributions in a worker without web readiness", async () => {
    const f = await setup(true);
    const registered: unknown[] = [];
    f.h.subscribe(SITE_BUILDER_CHANNELS.routeRegister, async (message) => {
      registered.push(message.payload);
      return { success: true };
    });
    await f.h.sendMessage(SITE_BUILDER_CHANNELS.routesCollect, {});
    expect(registered).toEqual([
      expect.objectContaining({
        pluginId: "@brains/contact:contact",
        routes: expect.arrayContaining([
          expect.objectContaining({ path: "/contact" }),
        ]),
      }),
    ]);
    expect(f.plugin.getWebRoutes()).toEqual([]);
    expect(
      f.h.getTemplates().get("@brains/contact:contact:page"),
    ).toBeDefined();
    await f.plugin.shutdown();
  });

  it("adds no page to a site without the form configured", async () => {
    const h = createPluginHarness({ domain: "brain.test" });
    const registered: unknown[] = [];
    h.subscribe(SITE_BUILDER_CHANNELS.routeRegister, async (message) => {
      registered.push(message.payload);
      return { success: true };
    });
    const { entity, service: plugin } = instantiate({});
    await entity.register(h.getMockShell());
    await plugin.register(h.getMockShell());
    await plugin.finalizeRegistration();
    await plugin.ready();
    expect(registered).toEqual([]);
  });
});
