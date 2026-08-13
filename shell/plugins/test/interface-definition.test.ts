import { describe, expect, expectTypeOf, it, mock } from "bun:test";
import { PermissionService } from "@brains/templates";
import { z } from "@brains/utils/zod";
import { createPluginHarness } from "../src/test/harness";
import {
  defineAccountSettings,
  defineDaemon,
  defineInterface,
  defineJob,
  defineMessageInterface,
  defineRoute,
  defineServicePlugin,
  instantiatePluginPackageDefinition,
  protocol,
} from "../src";

const digestJob = defineJob({
  name: "compile-digest",
  input: z.object({ bookmarkId: z.string() }),
  output: z.object({ bookmarkId: z.string() }),
});

function instantiate(
  definition: Parameters<typeof instantiatePluginPackageDefinition>[0],
  config: unknown,
  name: string,
): NonNullable<ReturnType<typeof instantiatePluginPackageDefinition>[number]> {
  const [plugin] = instantiatePluginPackageDefinition(definition, config, {
    name,
    version: "0.1.0",
  });
  if (!plugin) throw new Error(`Plugin ${name} was not created`);
  return plugin;
}

describe("declarative generic interfaces", () => {
  it("fails finalization when account settings have no auth backend", async () => {
    const settings = defineAccountSettings({
      title: "Mailbox",
      schema: z.object({ password: z.string() }),
      fields: { password: { label: "Password", secret: true } },
    });
    const definition = defineInterface({
      id: "mailbox-no-runtime",
      config: z.object({}),
      accountSettings: settings,
    });
    const harness = createPluginHarness();
    await harness.installPlugin(
      instantiate(definition, {}, "@fixture/mailbox-no-runtime"),
    );
    expect(harness.finalizeRegistration()).rejects.toThrow(
      "require auth-service and an account settings encryption key",
    );
  });

  it("authenticates protocol callers, resolves trust, and enqueues typed jobs", async () => {
    const service = defineServicePlugin({
      id: "digest-service",
      config: z.object({}),
      setup: () => ({}),
      jobs: () => [
        digestJob.handle(async ({ input }) => ({
          bookmarkId: input.bookmarkId,
        })),
      ],
    });
    const definition = defineInterface({
      id: "reading-webhook",
      config: z.object({ token: z.string() }),
      routes: ({ config, jobs }) => [
        defineRoute({
          method: "GET",
          path: "/health",
          security: { kind: "public" },
          response: z.object({ status: z.literal("ok") }),
          handle: () => ({ status: "ok" }),
        }),
        defineRoute({
          method: "POST",
          path: "/digest",
          security: protocol({
            authenticate({ request }) {
              return request.headers.get("authorization") === config.token
                ? { id: "reader-1" }
                : null;
            },
          }),
          body: digestJob.input,
          response: z.object({
            jobId: z.string(),
            permission: z.enum(["admin", "trusted", "public"]),
            anchor: z.boolean(),
          }),
          async handle({ body, caller }) {
            expectTypeOf(body.bookmarkId).toEqualTypeOf<string>();
            expectTypeOf(caller.permission).toEqualTypeOf<
              "admin" | "trusted" | "public"
            >();
            const job = await jobs.enqueue(digestJob, body);
            return {
              jobId: job.id,
              permission: caller.permission,
              anchor: caller.isAnchor,
            };
          },
        }),
      ],
    });

    const harness = createPluginHarness();
    const shell = harness.getMockShell();
    shell.getPermissionService = (): PermissionService =>
      new PermissionService({
        admins: ["reading-webhook:reader-1"],
        anchors: ["reading-webhook:reader-1"],
      });
    const queue = shell.getJobQueueService();
    const enqueue = mock(queue.enqueue);
    queue.enqueue = enqueue;
    shell.getJobQueueService = (): typeof queue => queue;
    await instantiate(service, {}, "@fixture/digest-service").register(shell);
    const plugin = instantiate(
      definition,
      { token: "Bearer secret" },
      "@fixture/reading-webhook",
    );
    await plugin.register(shell);

    const routes = plugin.getWebRoutes?.() ?? [];
    const health = routes.find((route) => route.path === "/health");
    const digest = routes.find((route) => route.path === "/digest");
    if (!health || !digest) throw new Error("Expected declarative routes");

    expect(
      await (await health.handler(new Request("http://brain/health"))).json(),
    ).toEqual({
      status: "ok",
    });
    const denied = await digest.handler(
      new Request("http://brain/digest", {
        method: "POST",
        body: JSON.stringify({ bookmarkId: "saved" }),
      }),
    );
    expect(denied.status).toBe(401);

    const accepted = await digest.handler(
      new Request("http://brain/digest", {
        method: "POST",
        headers: {
          authorization: "Bearer secret",
          "content-type": "application/json",
        },
        body: JSON.stringify({ bookmarkId: "saved" }),
      }),
    );
    expect(accepted.status).toBe(200);
    expect(await accepted.json()).toMatchObject({
      jobId: expect.stringContaining("job-"),
      permission: "admin",
      anchor: true,
    });
    // Cross-package enqueue carries the interface plugin's attribution.
    expect(enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        options: expect.objectContaining({
          source: expect.stringContaining("reading-webhook"),
          metadata: expect.objectContaining({
            pluginId: expect.stringContaining("reading-webhook"),
          }),
        }),
      }),
    );
  });

  it("supervises one account task per configured principal and reconciles rotation/removal", async () => {
    const settings = defineAccountSettings({
      title: "Mailbox",
      schema: z.object({ password: z.string() }),
      fields: { password: { label: "Password", secret: true } },
    });
    const started: string[] = [];
    const stopped: string[] = [];
    const definition = defineInterface({
      id: "mailbox",
      config: z.object({}),
      accountSettings: settings,
      daemons: () => [
        defineDaemon({
          id: "mailboxes",
          forAccounts: settings,
          async run({ account, health, signal }) {
            expectTypeOf(account.settings.password).toEqualTypeOf<string>();
            started.push(`${account.id}:${account.settings.password}`);
            health.ready();
            await new Promise<void>((resolve) => {
              signal.addEventListener(
                "abort",
                () => {
                  stopped.push(`${account.id}:${account.settings.password}`);
                  resolve();
                },
                { once: true },
              );
            });
          },
        }),
      ],
    });

    const harness = createPluginHarness();
    const shell = harness.getMockShell();
    const accountSettings = shell.getAccountSettingsRegistry();
    const configured = new Map<
      string,
      {
        values: Readonly<Record<string, string | number | boolean | null>>;
        revision: number;
      }
    >([
      ["actor-1", { values: { password: "first" }, revision: 1 }],
      ["actor-2", { values: { password: "second" }, revision: 1 }],
    ]);
    accountSettings.bindBackend({
      read: async (identity) => configured.get(identity.actorId) ?? null,
      list: async () =>
        [...configured.entries()].map(([actorId, value]) => ({
          actorId,
          ...value,
        })),
      write: async (identity, values) => {
        const stored = {
          values,
          revision: (configured.get(identity.actorId)?.revision ?? 0) + 1,
        };
        configured.set(identity.actorId, stored);
        return stored;
      },
      delete: async (identity) => configured.delete(identity.actorId),
      deleteActor: async (actorId) => (configured.delete(actorId) ? 1 : 0),
    });
    const plugin = instantiate(definition, {}, "@fixture/mailbox");
    await harness.installPlugin(plugin);
    await harness.finalizeRegistration();
    const daemon = shell.getDaemonRegistry().get(`${plugin.id}:mailboxes`);
    if (!daemon) throw new Error("Account daemon was not registered");
    await daemon.daemon.start();
    expect(started).toEqual(["actor-1:first", "actor-2:second"]);
    expect(await daemon.daemon.healthCheck?.()).toMatchObject({
      status: "healthy",
      details: { total: 2, ready: 2 },
    });

    await accountSettings.save(
      accountSettings.listRegistrations()[0]?.id ?? "missing",
      "actor-1",
      { password: "rotated" },
    );
    await Bun.sleep(0);
    expect(stopped).toContain("actor-1:first");
    expect(started).toContain("actor-1:rotated");

    await accountSettings.delete(
      accountSettings.listRegistrations()[0]?.id ?? "missing",
      "actor-2",
    );
    await Bun.sleep(0);
    expect(stopped).toContain("actor-2:second");
    expect(await daemon.daemon.healthCheck?.()).toMatchObject({
      status: "healthy",
      details: { total: 1, ready: 1 },
    });

    await daemon.daemon.stop();
    expect(stopped).toContain("actor-1:rotated");
  });

  it("supervises one abortable daemon with emitted health", async () => {
    let stopped = false;
    const definition = defineInterface({
      id: "event-feed",
      config: z.object({}),
      daemons: () => [
        defineDaemon({
          id: "events",
          required: true,
          async run({ signal, health }) {
            health.warning("Connecting");
            health.ready();
            await new Promise<void>((resolve) => {
              signal.addEventListener(
                "abort",
                () => {
                  stopped = true;
                  resolve();
                },
                { once: true },
              );
            });
          },
        }),
      ],
    });
    const harness = createPluginHarness();
    const plugin = instantiate(definition, {}, "@fixture/event-feed");
    await harness.installPlugin(plugin);

    expect(plugin.requiresDaemonStartup?.()).toBeTrue();
    const registry = harness.getMockShell().getDaemonRegistry();
    const daemonName = `${plugin.id}:events`;
    await registry.start(daemonName);
    expect(await registry.checkHealth(daemonName)).toMatchObject({
      status: "healthy",
      message: "Ready",
    });
    await registry.stop(daemonName);
    expect(stopped).toBeTrue();
  });
});

describe("declarative message interfaces", () => {
  it("rejects conversational listeners without a reply transport", () => {
    expect(() =>
      defineMessageInterface({
        id: "silent-listener",
        config: z.object({}),
        channel: {
          type: "silent",
          displayName: "Silent",
          subjectLabel: "Room",
          recipient: z.string(),
        },
        listen: async () => {},
      }),
    ).toThrow("must define send when it defines listen");
  });

  it("runs account-bound daemons in message-interface packages", async () => {
    const settings = defineAccountSettings({
      title: "Mailbox",
      schema: z.object({ user: z.string() }),
      fields: { user: { label: "User" } },
    });
    const started: string[] = [];
    const definition = defineMessageInterface({
      id: "mail-channel",
      config: z.object({}),
      accountSettings: settings,
      channel: {
        type: "mail-channel",
        displayName: "Mail",
        subjectLabel: "Address",
        recipient: z.string(),
      },
      daemons: () => [
        defineDaemon({
          id: "mailboxes",
          forAccounts: settings,
          required: true,
          async run({ account, health, signal }) {
            started.push(`${account.id}:${account.settings.user}`);
            health.ready();
            await new Promise<void>((resolve) =>
              signal.addEventListener("abort", () => resolve(), { once: true }),
            );
          },
        }),
      ],
    });
    const harness = createPluginHarness();
    const registry = harness.getMockShell().getAccountSettingsRegistry();
    registry.bindBackend({
      read: async () => ({ values: { user: "mira" }, revision: 1 }),
      list: async () => [
        { actorId: "actor-1", values: { user: "mira" }, revision: 1 },
      ],
      write: async (_identity, values) => ({ values, revision: 2 }),
      delete: async () => false,
      deleteActor: async () => 0,
    });
    const plugin = instantiate(definition, {}, "@fixture/mail-channel");
    await harness.installPlugin(plugin);
    await harness.finalizeRegistration();
    expect(plugin.requiresDaemonStartup?.()).toBeTrue();
    const daemon = harness
      .getMockShell()
      .getDaemonRegistry()
      .get(`${plugin.id}:mailboxes`);
    if (!daemon) throw new Error("Message account daemon was not registered");
    await daemon.daemon.start();
    expect(started).toEqual(["actor-1:mira"]);
    await daemon.daemon.stop();
  });

  it("allows outbound-only delivery without setup or listener placeholders", async () => {
    const definition = defineMessageInterface({
      id: "pager",
      config: z.object({}),
      channel: {
        type: "pager",
        displayName: "Pager",
        subjectLabel: "Address",
        recipient: z.string().min(1),
      },
      deliver: ({ recipient, message }) => `${recipient}:${message.text}`,
    });
    const harness = createPluginHarness();
    await harness.installPlugin(instantiate(definition, {}, "@fixture/pager"));
    await harness.finalizeRegistration();
    const provider = harness
      .getMockShell()
      .getChannelRegistry()
      .getDeliveryProvider("pager");
    if (!provider) throw new Error("Pager delivery provider is absent");
    expect(
      await provider.send({
        recipient: "ops",
        subject: "Alert",
        text: "Ready",
        idempotencyKey: "alert-1",
      }),
    ).toEqual({ status: "sent", providerDeliveryId: "ops:Ready" });
  });

  it("owns listener, normalized send/edit, delivery, and lazy attachments", async () => {
    let receiver:
      | {
          receiveAuthenticated(input: {
            sender: { id: string; displayName?: string };
            channel: { id: string; threadId?: string };
            text: string;
            attachments?: () => Promise<
              readonly { name: string; mediaType: string; url: string }[]
            >;
          }): Promise<void>;
        }
      | undefined;
    const sent: Array<{ channelId: string; text: string }> = [];
    const edited: Array<{ messageId: string; text: string }> = [];
    const delivered: Array<{ roomId: string; text: string }> = [];
    const attachmentLookup = mock(async () => [
      {
        name: "saved.txt",
        mediaType: "text/plain",
        url: "data:text/plain,saved%20attachment",
      },
    ]);
    const definition = defineMessageInterface({
      id: "campfire",
      config: z.object({ token: z.string() }),
      channel: {
        type: "campfire",
        displayName: "Campfire",
        subjectLabel: "Room",
        recipient: z.object({ roomId: z.string().min(1) }),
      },
      setup: ({ config }) => ({ token: config.token }),
      async listen({ state, signal, health, messages }) {
        expect(state.token).toBe("secret");
        receiver = messages;
        health.ready();
        await new Promise<void>((resolve) => {
          signal.addEventListener("abort", () => resolve(), { once: true });
        });
      },
      async send({ state, channel, message }) {
        expect(state.token).toBe("secret");
        sent.push({ channelId: channel.id, text: message.text });
        return `message-${sent.length}`;
      },
      edit({ messageId, message }) {
        edited.push({ messageId, text: message.text });
      },
      deliver({ recipient, message }) {
        delivered.push({ roomId: recipient.roomId, text: message.text });
        return "delivery-1";
      },
    });

    const harness = createPluginHarness();
    harness.setPermissionService(
      new PermissionService({
        admins: ["campfire:reader-1"],
        anchors: ["campfire:reader-1"],
      }),
    );
    const chat = mock(async () => ({
      text: "Digest accepted",
      usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
    }));
    harness.setAgentService({
      chat,
      confirmPendingAction: async () => ({
        text: "Confirmed",
        usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
      }),
      invalidateAgent: () => {},
    });
    const plugin = instantiate(
      definition,
      { token: "secret" },
      "@fixture/campfire",
    );
    await harness.installPlugin(plugin);
    await harness.finalizeRegistration();

    const registry = harness.getMockShell().getDaemonRegistry();
    const daemonName = `${plugin.id}:listener`;
    await registry.start(daemonName);
    if (!receiver) throw new Error("Listener did not expose its receiver");
    await receiver.receiveAuthenticated({
      sender: { id: "reader-1", displayName: "Reader" },
      channel: { id: "room-1", threadId: "thread-1" },
      text: "Compile this",
      attachments: attachmentLookup,
    });

    expect(attachmentLookup).toHaveBeenCalledTimes(1);
    expect(chat).toHaveBeenCalledWith(
      "Compile this",
      "campfire:room-1:thread-1",
      expect.objectContaining({
        userPermissionLevel: "admin",
        isAnchor: true,
        attachments: [
          expect.objectContaining({
            kind: "text",
            filename: "saved.txt",
            content: "saved attachment",
          }),
        ],
      }),
      expect.any(AbortSignal),
    );
    expect(sent).toEqual([{ channelId: "room-1", text: "Digest accepted" }]);

    const edit = Reflect.get(plugin, "editMessage");
    if (typeof edit !== "function") throw new Error("Edit adapter is absent");
    expect(
      await Reflect.apply(edit, plugin, [
        {
          channelId: "room-1",
          messageId: "message-1",
          newMessage: "Updated",
        },
      ]),
    ).toBeTrue();
    expect(edited).toEqual([{ messageId: "message-1", text: "Updated" }]);

    const provider = harness
      .getMockShell()
      .getChannelRegistry()
      .getDeliveryProvider("campfire");
    if (!provider) throw new Error("Delivery provider was not registered");
    expect(
      await provider.send({
        recipient: "announcements",
        subject: "Announcements",
        text: "Digest ready",
        idempotencyKey: "digest-1",
      }),
    ).toEqual({ status: "sent", providerDeliveryId: "delivery-1" });
    expect(delivered).toEqual([
      { roomId: "announcements", text: "Digest ready" },
    ]);
    expect(
      await provider.send({
        recipient: "",
        subject: "Invalid",
        text: "No room",
        idempotencyKey: "digest-2",
      }),
    ).toEqual({ status: "failed", failureCode: "delivery_failed" });

    await registry.stop(daemonName);
    await plugin.shutdown?.();
  });
});
