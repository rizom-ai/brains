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

  it("fails explicitly until account-bound daemon supervision lands", async () => {
    const settings = defineAccountSettings({
      title: "Mailbox",
      schema: z.object({ password: z.string() }),
      fields: { password: { label: "Password", secret: true } },
    });
    const definition = defineInterface({
      id: "mailbox",
      config: z.object({}),
      accountSettings: settings,
      daemons: () => [
        defineDaemon({
          id: "mailboxes",
          forAccounts: settings,
          async run({ account }) {
            expectTypeOf(account.settings.password).toEqualTypeOf<string>();
          },
        }),
      ],
    });

    expect(() =>
      instantiate(definition, {}, "@fixture/mailbox").register(
        createPluginHarness().getMockShell(),
      ),
    ).toThrow("requires the account-settings runtime");
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
