import { describe, expect, it, mock, spyOn, setSystemTime } from "bun:test";
import {
  createPluginHarness,
  createTestEntityAdapter,
} from "@brains/plugins/test";
import { renderToStaticMarkup } from "react-dom/server";
import {
  baseEntitySchema,
  type ChannelDeliveryInput,
  type JobHandler,
  type ServicePluginContext,
  type WebRouteDefinition,
} from "@brains/plugins";
import { parseFormMarkdown } from "@brains/forms";
import { CallbackProgressReporter } from "@brains/utils/progress";
import { MessageBus } from "@brains/messaging-service";
import { createSilentLogger } from "@brains/test-utils";
import notificationsPackage from "@brains/notifications";
import { instantiatePluginPackageDefinition } from "@brains/plugins";
import {
  SITE_METADATA_UPDATED_CHANNEL,
  siteBuilderPagesContract,
  siteBuilderRouteRegisterContract,
  siteMetadataContract,
} from "@brains/site-composition";
import { contactRequestSchema } from "../src";
import {
  createContactPlugin,
  createContactPluginPair,
  type ContactService,
} from "./contact-plugins";
import type { ContactPluginConfig } from "../src/config";
import { admissionPolicy, input, peer } from "./intake-fixture";

type RecurringCheckDefinition = Parameters<
  ServicePluginContext["recurringChecks"]["register"]
>[0];
// The brain's domain gives the intake its origin; the tests tighten the
// policy's limits to the fixture's small ones.
const origin: string = "https://brain.test";
const inboxUrl: string = `${origin}/studio/workspaces/unified-inbox%3Ainbox`;
const config: ContactPluginConfig = {
  intake: { admission: admissionPolicy },
};
type Harness = ReturnType<typeof createPluginHarness>;
/** One brain process. A worker shares the web process's runtime state, as the
 * deployed web and worker processes share their runtime database. */
async function setup(
  executionOnly = false,
  sharesStateWith?: Harness,
  brain: Parameters<typeof createPluginHarness>[0] = { domain: "brain.test" },
  wiring: {
    /** Deliver over the runtime's own message bus rather than the double. */
    readonly realBus?: boolean;
    /** Configure notifications with no default recipient. */
    readonly noRecipient?: boolean;
  } = {},
): Promise<{
  h: Harness;
  shell: ReturnType<Harness["getMockShell"]>;
  checks: RecurringCheckDefinition[];
  sent: ChannelDeliveryInput[];
  /** The site pages the plugin declared while registering. */
  pages: unknown[];
  /** What the owner's email transport answers; switch to fail an alert. */
  transport: { status: "sent" | "failed" | "unavailable" };
  plugin: ContactService;
  handlers: Map<string, JobHandler>;
}> {
  const h = createPluginHarness(brain);
  const shell = h.getMockShell();
  if (wiring.realBus)
    spyOn(shell, "getMessageBus").mockReturnValue(
      MessageBus.createFresh(createSilentLogger("contact-bus")),
    );
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
        role: "studio-workspaces",
        public: true,
        handler: (): Response => new Response(),
      },
    },
  ]);
  const pages: unknown[] = [];
  h.subscribe(siteBuilderRouteRegisterContract.name, async (message) => {
    pages.push(message.payload);
    return { success: true };
  });
  const [entityPlugin, plugin] = createContactPluginPair(config);
  await entityPlugin.register(shell);
  // Forms in the brain's content come with its site.
  shell
    .getEntityRegistry()
    .registerEntityType(
      "form",
      baseEntitySchema.partial().passthrough(),
      createTestEntityAdapter("form"),
    );
  const sent: ChannelDeliveryInput[] = [];
  const transport: { status: "sent" | "failed" | "unavailable" } = {
    status: "sent",
  };
  const channels = shell.getChannelRegistry();
  channels.registerDescriptor("test-email", {
    type: "email",
    displayName: "Email",
    subjectLabel: "Email address",
  });
  channels.registerDeliveryProvider("test-email", {
    channelType: "email",
    isAvailable: async () => transport.status !== "unavailable",
    send: async (message) => {
      if (transport.status === "failed")
        return { status: "failed", failureCode: "test-transport" };
      sent.push(message);
      return { status: "sent" };
    },
  });
  channels.finalize();
  const [notifications] = instantiatePluginPackageDefinition(
    notificationsPackage,
    wiring.noRecipient
      ? {}
      : { defaultRecipient: { type: "email", address: "owner@example.com" } },
    { name: "@brains/notifications", version: "0.0.0-test" },
    { pluginId: "notifications" },
  );
  if (!notifications) throw new Error("Notifications installs no plugin");
  await notifications.register(shell, { executionOnly });
  await plugin.register(shell, { executionOnly });
  return { h, shell, checks, sent, pages, transport, plugin, handlers };
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
  it("serves nothing before it registers, and needs no configuration once it has", async () => {
    expect(createContactPlugin().getWebRoutes()).toEqual([]);
    const h = createPluginHarness({ domain: "brain.test" });
    const plugin = createContactPlugin();
    await plugin.register(h.getMockShell());
    expect(
      plugin.getWebRoutes().map((route) => `${route.method} ${route.path}`),
    ).toEqual([
      "GET /contact",
      "POST /contact",
      "GET /contact/thanks",
      // Forms in the brain's content, wherever they claim.
      "GET /_forms/contact",
      "POST /_forms/contact",
    ]);
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
      await createContactPlugin()
        .register(h.getMockShell())
        .catch((error: unknown) => error),
    ).toEqual(new Error("Contact intake needs the brain's site URL"));
  });
  it("gates startup, saves/enqueues without sending inline, then alerts the owner with the request, answerable by email", async () => {
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
        text: [
          `Name: ${input.name}`,
          `Email: ${input.email}`,
          `Message: ${input.message}`,
          "",
          "Reply to this email to answer.",
          `Mark it done in your Inbox: ${inboxUrl}`,
        ].join("\n"),
        sensitivity: "secret",
        idempotencyKey: expect.stringMatching(/^contact-notification:contact-/),
        replyTo: input.email,
      },
    ]);
    // The queue holds an id only; the request travels in the alert itself.
    expect(JSON.stringify(jobs)).not.toContain(input.email);
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
    bus.subscribe(siteMetadataContract.name, async () => ({
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
    // A malformed update is refused; it no longer clears the theme.
    await bus.send({
      type: SITE_METADATA_UPDATED_CHANNEL,
      payload: { ...site, themeMode: "sepia" },
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

  it("closes on stale or failed maintenance and keeps every request through it", async () => {
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
      const read = spyOn(f.h.getEntityService(), "getEntity").mockRejectedValue(
        new Error("PRIVATE"),
      );
      expect(
        await check
          .run({ signal: new AbortController().signal })
          .catch((error: unknown) => error),
      ).toEqual(new Error("Contact maintenance unavailable"));
      expect(
        (await f.shell.getOperationalHealthRegistry().getChecks())[0]?.status,
      ).toBe("unhealthy");
      read.mockRestore();
      await check.run({ signal: new AbortController().signal });
      expect(
        (
          await route.handler(new Request(`${origin}/contact`), {
            remoteAddress: peer,
          })
        ).status,
      ).toBe(200);
      expect(
        await f.h.getEntityService().listEntities(
          {
            entityType: "contact-request",
            options: { filter: { visibilityScope: "restricted" } },
          },
          contactRequestSchema,
        ),
      ).toHaveLength(1);
      // An alert queued before the outage still goes out.
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
      ).toBe("sent");
      expect(f.sent).toHaveLength(1);
    } finally {
      await f?.plugin.shutdown();
      setSystemTime();
    }
  });

  it("in a separate worker, declares the form for site builds and runs maintenance, but never serves", async () => {
    const f = await setup(true);
    // The site builds in this worker, which never runs the ready phase, so
    // the pages are declared while registering.
    expect(f.pages).toEqual([
      {
        pluginId: "contact",
        routes: [
          expect.objectContaining({ id: "contact", path: "/contact" }),
          expect.objectContaining({
            id: "contact-thanks",
            path: "/contact/thanks",
          }),
        ],
      },
    ]);
    const routes = f.plugin.getWebRoutes();
    expect(routes.map((route) => `${route.method} ${route.path}`)).toEqual([
      "GET /contact",
      "POST /contact",
      "GET /contact/thanks",
      "GET /_forms/contact",
      "POST /_forms/contact",
    ]);
    expect(routes.every((route) => route.public && route.preview)).toBe(true);
    // The site finds the form by what it is, not by this plugin's id.
    expect(
      routes
        .filter((route) => route.role === "contact-form")
        .map((route) => `${route.method} ${route.path}`),
    ).toEqual(["GET /contact", "POST /contact"]);
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
    const unavailable = new Error("Form notification unavailable");
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
    // Maintenance then lets go of the failed alert; the request stays.
    const check = f.checks[0];
    if (!check) throw new Error("Missing maintenance");
    await check.run({ signal: new AbortController().signal });
    expect(await intake()).toMatchObject({
      status: "healthy",
      details: { inFlight: 0, failed: 0, failures: {} },
    });
    expect(
      await inbox.resolveDetail?.(
        request.id,
        { permissionLevel: "admin" },
        new AbortController().signal,
      ),
    ).toMatchObject({ kind: "plain" });
    await f.plugin.shutdown();
  });

  // Each refusal notifications answers reaches contact as its reason, over
  // the runtime's own bus.
  for (const [why, wiring, transport, failure] of [
    [
      "no recipient is configured",
      { noRecipient: true },
      "sent",
      "recipient-missing",
    ],
    ["no transport is available", {}, "unavailable", "transport-missing"],
    ["the transport refuses", {}, "failed", "test-transport"],
  ] as const) {
    it(`records why an alert was not sent when ${why}`, async () => {
      const f = await setup(
        false,
        undefined,
        { domain: "brain.test" },
        {
          realBus: true,
          ...wiring,
        },
      );
      f.transport.status = transport;
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
      await attempt();
      await attempt();
      expect(await attempt()).toBe("failed");
      expect(
        (await f.shell.getOperationalHealthRegistry().getChecks())[0],
      ).toMatchObject({ details: { failures: { [failure]: 1 } } });
      await f.plugin.shutdown();
    });
  }

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
    const registered = f.pages;
    await f.plugin.ready();
    const component = f.h.getTemplates().get("contact:page")?.layout?.component;
    if (!component) throw new Error("Missing contact:page template");
    // One template for every form, each page naming its form's slot.
    expect(renderToStaticMarkup(component({ slot: "contact" }))).toBe(
      '<div data-site-slot="contact"></div>',
    );
    const page = (id: string, path: string, title: string): unknown => ({
      id,
      path,
      title,
      sections: [
        { id: "form", template: "contact:page", content: { slot: "contact" } },
      ],
      navigation: { show: false },
    });
    // The command is validated, its defaults filled, before it is sent.
    expect(registered).toEqual([
      siteBuilderRouteRegisterContract.schema.parse({
        pluginId: "contact",
        routes: [
          page("contact", "/contact", "Contact"),
          page("contact-thanks", "/contact/thanks", "Note saved"),
        ],
      }),
    ]);
  });
});

const workWithUs = `---
target: contact-request
path: /work-with-us
title: Work with us
pageTitle: Work with us
submitLabel: Send
thanks:
  title: Thanks
steps:
  - fields:
      - kind: text
        id: name
        label: Your name
        required: true
      - kind: email
        id: email
        label: Email
        required: true
      - kind: longText
        id: message
        label: What do you have in mind?
---
Tell us about your project.
`;

type Setup = Awaited<ReturnType<typeof setup>>;

/** What the form type keeps to find a form by. */
function formMetadata(id: string, content: string): Record<string, string> {
  const { title, target, path } = parseFormMarkdown(id, content);
  return { title, target, path };
}

async function addForm(f: Setup, id: string, content: string): Promise<void> {
  await f.h.getEntityService().createEntity({
    entity: {
      id,
      entityType: "form",
      visibility: "public",
      content,
      metadata: formMetadata(id, content),
    },
  });
  await f.shell.getMessageBus().send({
    type: "entity:created",
    payload: { entityType: "form", entityId: id },
    sender: "test",
  });
}

/** The route serving a path: its exact route, else the claim route claiming it. */
function routeFor(
  f: Setup,
  path: string,
  method: "GET" | "POST",
): WebRouteDefinition | undefined {
  const routes = f.plugin
    .getWebRoutes()
    .filter((route) => (route.method ?? "GET") === method);
  return (
    routes.find((route) => route.match !== "claim" && route.path === path) ??
    routes.find((route) => route.match === "claim" && route.claims?.(path))
  );
}

async function send(f: Setup, path: string): Promise<Response> {
  const get = routeFor(f, path, "GET");
  const post = routeFor(f, path, "POST");
  if (!get || !post) throw new Error(`Nothing serves ${path}`);
  const page = await get.handler(new Request(`${origin}${path}`), {
    remoteAddress: peer,
  });
  const token = (await page.text()).match(
    /name="token" value="([a-f0-9]+)"/,
  )?.[1];
  if (!token) throw new Error("Missing token");
  return post.handler(
    new Request(`${origin}${path}`, {
      method: "POST",
      headers: { origin },
      body: new URLSearchParams({ token, ...input }),
    }),
    { remoteAddress: peer },
  );
}

describe("forms defined in the brain's content", () => {
  it("serves a form for contact requests at its own path, its pages built with the site", async () => {
    const f = await setup();
    await addForm(f, "work-with-us", workWithUs);
    await f.plugin.ready();
    const get = routeFor(f, "/work-with-us", "GET");
    const page = await get?.handler(new Request(`${origin}/work-with-us`), {
      remoteAddress: peer,
    });
    expect(page?.status).toBe(200);
    const html = await page?.text();
    expect(html).toContain("<h1>Work with us</h1>");
    expect(html).toContain("Tell us about your project.");
    expect(html).toContain(
      '<label for="form-work-with-us-name">Your name</label>',
    );
    const sent = await send(f, "/work-with-us");
    expect(sent.status).toBe(303);
    expect(sent.headers.get("location")).toBe("/work-with-us/thanks");
    expect(routeFor(f, "/work-with-us/thanks", "GET")).toBeDefined();
    expect(routeFor(f, "/work-with-us/thanks", "POST")).toBeUndefined();
    const requests = await f.h.getEntityService().listEntities(
      {
        entityType: "contact-request",
        options: { filter: { visibilityScope: "restricted" } },
      },
      contactRequestSchema,
    );
    expect(requests.map((request) => request.id)).toEqual([
      expect.stringMatching(/^work-with-us-[a-f0-9]{64}$/),
    ]);
    const pages = await f.shell.getMessageBus().send({
      type: siteBuilderPagesContract.name,
      payload: {},
      sender: "test",
    });
    expect(JSON.stringify(pages)).toContain('"path":"/work-with-us"');
    expect(JSON.stringify(pages)).toContain('"path":"/work-with-us/thanks"');
    await f.plugin.shutdown();
  });

  it("lets content override the built-in contact form's words, never its path", async () => {
    const f = await setup();
    await addForm(
      f,
      "contact",
      workWithUs.replace("title: Work with us", "title: Write to us"),
    );
    await f.plugin.ready();
    const page = await routeFor(f, "/contact", "GET")?.handler(
      new Request(`${origin}/contact`),
      { remoteAddress: peer },
    );
    expect(await page?.text()).toContain("<h1>Write to us</h1>");
    // An override is the built-in form: nothing else is claimed for it.
    const claim = f.plugin
      .getWebRoutes()
      .find((route) => route.match === "claim" && route.method === "GET");
    expect(claim?.claims?.("/contact")).toBe(false);
    expect(claim?.claims?.("/work-with-us")).toBe(false);
    expect((await send(f, "/contact")).status).toBe(303);
    await f.plugin.shutdown();
  });

  it("follows the content: a form that goes is no longer served, one its target cannot hold never is", async () => {
    const f = await setup();
    await f.plugin.ready();
    await addForm(f, "work-with-us", workWithUs);
    await addForm(
      f,
      "phone",
      workWithUs
        .replace("path: /work-with-us", "path: /call-me")
        .replace("id: message", "id: phone")
        .replace("kind: longText", "kind: text"),
    );
    expect(routeFor(f, "/work-with-us", "GET")).toBeDefined();
    expect(routeFor(f, "/call-me", "GET")).toBeUndefined();
    await f.h
      .getEntityService()
      .deleteEntity({ entityType: "form", id: "work-with-us" });
    await f.shell.getMessageBus().send({
      type: "entity:deleted",
      payload: { entityType: "form", entityId: "work-with-us" },
      sender: "test",
    });
    expect(routeFor(f, "/work-with-us", "GET")).toBeUndefined();
    await f.plugin.shutdown();
  });
});
