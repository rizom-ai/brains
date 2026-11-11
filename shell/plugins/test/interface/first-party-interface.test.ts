import { describe, expect, it, mock } from "bun:test";
import { PermissionService } from "@brains/templates";
import { createSilentLogger } from "@brains/test-utils";
import { z } from "@brains/utils/zod";
import { defineBusContract, defineChannel } from "@brains/contracts";
import type { IAgentService } from "@brains/ai-service";
import type { IConversationService } from "@brains/conversation-service";
import { createMockShell } from "../../src/test/mock-shell";
import { createTempDataDir } from "../../src/test/temp-dir";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createMockAuthBackend } from "../../src/test/mock-auth-backend";
import {
  captureUrlViaAgent,
  defineDaemon,
  defineInterface,
  defineMessageInterface,
  instantiatePluginPackageDefinition,
  interfaceRuntime,
  defineRoute,
  withChannels,
  withDaemon,
  withMessageTransport,
  withProtocolPlugin,
  withTools,
  withWebRoutes,
  type Plugin,
  type ToolInfo,
  type ToolResponse,
  type FirstPartyDaemon,
  type InterfaceRuntime,
  type MessageTransportSend,
  type PluginPackageDefinition,
} from "../../src";

const metadata = { name: "@brains/terminal", version: "0.1.0" };

function instantiate(
  definition: PluginPackageDefinition,
  config: unknown = {},
): ReturnType<typeof instantiatePluginPackageDefinition>[number] {
  const [plugin] = instantiatePluginPackageDefinition(
    definition,
    config,
    metadata,
    { pluginId: "terminal" },
  );
  if (!plugin) throw new Error("No plugin was created");
  return plugin;
}

const config = z.object({ greeting: z.string().default("hello") });

/** Where each slot reached the runtime from, as the test records it. */
interface Reached {
  setup?: InterfaceRuntime;
  routes?: InterfaceRuntime;
  daemons?: InterfaceRuntime;
  daemon?: InterfaceRuntime;
  transport?: InterfaceRuntime;
}

function stoppedDaemon(id: string): FirstPartyDaemon {
  let running = false;
  return {
    id,
    start: async (): Promise<void> => {
      running = true;
    },
    stop: async (): Promise<void> => {
      running = false;
    },
    healthCheck: async () => ({
      status: running ? "healthy" : "error",
      message: running ? "running" : "not running",
      details: { running },
    }),
  };
}

describe("interfaceRuntime", () => {
  it("is refused for a context the brain did not build", () => {
    expect(() => interfaceRuntime({ config: {}, state: {} })).toThrow(
      "This context carries no interface runtime",
    );
  });

  it("is reached from setup, the public slots and the first-party slots", async () => {
    const reached: Reached = {};
    const terminal = withMessageTransport(
      withDaemon(
        defineInterface(
          {
            id: "terminal",
            config,
            setup: (context) => {
              reached.setup = interfaceRuntime(context);
              const lines: string[] = [];
              return { lines };
            },
          },
          {
            routes: (context) => {
              reached.routes = interfaceRuntime(context);
              return [];
            },
            daemons: (context) => {
              reached.daemons = interfaceRuntime(context);
              return [];
            },
          },
        ),
        (context) => {
          reached.daemon = interfaceRuntime(context);
          return stoppedDaemon("terminal");
        },
      ),
      (context) => {
        reached.transport = interfaceRuntime(context);
        return { send: (): void => {} };
      },
    );

    await instantiate(terminal).register(createMockShell());

    const runtimes = Object.values(reached);
    expect(runtimes).toHaveLength(5);
    // One runtime per registration, whichever slot reaches it.
    expect(new Set(runtimes).size).toBe(1);
  });

  it("asks the brain's agent, as the class asked context.agent", async () => {
    const chat = mock<IAgentService["chat"]>(async () => ({
      text: "From the agent",
      usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
    }));
    const confirmPendingAction = mock<IAgentService["confirmPendingAction"]>(
      async () => ({
        text: "Confirmed",
        usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
      }),
    );
    let runtime: InterfaceRuntime | undefined;
    const terminal = defineInterface({
      id: "terminal",
      config,
      setup: (context) => {
        runtime = interfaceRuntime(context);
        return {};
      },
    });
    await instantiate(terminal).register(
      createMockShell({
        agentService: { chat, confirmPendingAction, invalidateAgent: () => {} },
      }),
    );
    if (!runtime) throw new Error("Setup did not run");

    const answer = await runtime.agent.chat("hi", "terminal", {
      userPermissionLevel: "admin",
      interfaceType: "terminal",
    });
    const confirmed = await runtime.agent.confirmPendingAction(
      "terminal",
      true,
      "approval-1",
      { userPermissionLevel: "admin", interfaceType: "terminal" },
    );

    expect(answer.text).toBe("From the agent");
    expect(chat).toHaveBeenCalledWith(
      "hi",
      "terminal",
      expect.objectContaining({ interfaceType: "terminal" }),
    );
    expect(confirmed.text).toBe("Confirmed");
    expect(confirmPendingAction).toHaveBeenCalledWith(
      "terminal",
      true,
      "approval-1",
      expect.objectContaining({ interfaceType: "terminal" }),
    );
  });

  it("reads a conversation's messages and whether a sender is the anchor", async () => {
    const getMessages = mock<IConversationService["getMessages"]>(
      async () => [],
    );
    const shell = createMockShell({
      logger: createSilentLogger(),
      conversationService: {
        startConversation: async () => "terminal",
        addMessage: async () => {},
        getMessages,
        countMessages: async () => 0,
        getConversation: async () => null,
        listConversations: async () => [],
        searchConversations: async () => [],
        updateConversationMetadata: async () => false,
        deleteConversation: async () => false,
        deleteExpiredGuestConversations: async () => 0,
        close: () => {},
      },
    });
    const permissions = new PermissionService({ anchors: ["terminal:local"] });
    shell.getPermissionService = (): PermissionService => permissions;
    let runtime: InterfaceRuntime | undefined;
    const terminal = defineInterface({
      id: "terminal",
      config,
      setup: (context) => {
        runtime = interfaceRuntime(context);
        return {};
      },
    });
    await instantiate(terminal).register(shell);
    if (!runtime) throw new Error("Setup did not run");

    await runtime.conversations.getMessages("terminal", { limit: 50 });

    expect(getMessages).toHaveBeenCalledWith("terminal", { limit: 50 });
    expect(runtime.permissions.isAnchor("terminal", "local")).toBe(true);
    expect(runtime.permissions.isAnchor("terminal", "someone")).toBe(false);
  });

  it("refuses message coordination to an interface without a transport", async () => {
    let runtime: InterfaceRuntime | undefined;
    const terminal = defineInterface({
      id: "terminal",
      config,
      setup: (context) => {
        runtime = interfaceRuntime(context);
        return {};
      },
    });
    await instantiate(terminal).register(createMockShell());
    if (!runtime) throw new Error("Setup did not run");
    const reached = runtime;

    expect(() => reached.messages).toThrow(
      'Interface "terminal" has no message transport',
    );
  });
});

describe("withDaemon", () => {
  it("registers each daemon as written under <plugin id>:<id>, with the config and state", async () => {
    const seen: unknown[] = [];
    const terminal = withDaemon(
      withDaemon(
        defineInterface({
          id: "terminal",
          config,
          setup: () => ({ name: "state" }),
        }),
        ({
          config: parsed,
          state,
        }: {
          config: { greeting: string };
          state: { name: string };
        }) => {
          seen.push(parsed.greeting, state.name);
          return stoppedDaemon("terminal");
        },
      ),
      () => stoppedDaemon("sweeper"),
    );
    const shell = createMockShell();
    const plugin = instantiate(terminal, { greeting: "hi" });
    await plugin.register(shell);
    const registry = shell.getDaemonRegistry();

    expect(seen).toEqual(["hi", "state"]);
    expect(registry.getAll()).toEqual([
      "terminal:terminal",
      "terminal:sweeper",
    ]);
    expect(await registry.checkHealth("terminal:terminal")).toEqual({
      status: "error",
      message: "not running",
      details: { running: false },
    });
    await registry.start("terminal:terminal");
    expect(await registry.checkHealth("terminal:terminal")).toEqual({
      status: "healthy",
      message: "running",
      details: { running: true },
    });
    await registry.stop("terminal:terminal");
    expect(
      "requiresDaemonStartup" in plugin &&
        typeof plugin.requiresDaemonStartup === "function"
        ? plugin.requiresDaemonStartup()
        : undefined,
    ).toBe(false);
  });

  it("refuses a daemon id the definition already declares", async () => {
    const terminal = withDaemon(
      defineInterface(
        { id: "terminal", config },
        {
          daemons: () => [
            defineDaemon({ id: "events", run: async () => undefined }),
          ],
        },
      ),
      () => stoppedDaemon("events"),
    );

    expect(instantiate(terminal).register(createMockShell())).rejects.toThrow(
      'Interface "terminal" defines daemon "events" more than once',
    );
  });

  it("is refused for a definition defineInterface did not return", () => {
    const inbox = defineMessageInterface({
      id: "inbox",
      config,
      channel: {
        type: "inbox",
        displayName: "Inbox",
        subjectLabel: "Address",
        recipient: z.string(),
      },
    });

    expect(() =>
      // @ts-expect-error a message interface is not a generic interface definition
      withDaemon(inbox, () => stoppedDaemon("inbox")),
    ).toThrow(
      'withDaemon takes a definition defineInterface returned; "inbox" is not one',
    );
  });

  it("leaves the definition it wraps as it was", async () => {
    const plain = defineInterface({ id: "terminal", config });
    withDaemon(plain, () => stoppedDaemon("terminal"));
    const shell = createMockShell();

    await instantiate(plain).register(shell);

    expect(shell.getDaemonRegistry().getAll()).toEqual([]);
  });
});

describe("withMessageTransport", () => {
  const jobDone = {
    id: "job-1",
    type: "job",
    status: "completed",
    metadata: {
      rootJobId: "job-1",
      operationType: "file_operations",
      interfaceType: "terminal",
      channelId: "room",
    },
  };

  async function installed(): Promise<{
    sent: MessageTransportSend[];
    runtime: () => InterfaceRuntime;
    publish: (event: unknown) => Promise<unknown>;
    plugin: ReturnType<typeof instantiate>;
  }> {
    const sent: MessageTransportSend[] = [];
    let reached: InterfaceRuntime | undefined;
    const terminal = withMessageTransport(
      defineInterface({ id: "terminal", config }),
      (context) => {
        reached = interfaceRuntime(context);
        return {
          send: (request): void => {
            sent.push(request);
          },
        };
      },
    );
    const shell = createMockShell();
    const plugin = instantiate(terminal);
    await plugin.register(shell);
    return {
      sent,
      plugin,
      runtime: (): InterfaceRuntime => {
        if (!reached) throw new Error("The transport slot did not run");
        return reached;
      },
      publish: (event) =>
        shell.getMessageBus().send({
          type: "job-progress",
          payload: event,
          sender: "test",
          broadcast: true,
        }),
    };
  }

  it("sends a job's completion through the transport, to the channel it came from", async () => {
    const { sent, publish } = await installed();

    await publish(jobDone);

    expect(sent).toEqual([
      { channelId: "room", message: "✅ **file operations** completed" },
    ]);
  });

  it("holds completions back while input is answered", async () => {
    const { sent, publish, runtime } = await installed();

    runtime().messages.startProcessingInput("room");
    await publish(jobDone);
    expect(sent).toEqual([]);
    runtime().messages.endProcessingInput();

    expect(sent).toEqual([
      { channelId: "room", message: "✅ **file operations** completed" },
    ]);
  });

  it("hands job progress to whatever follows it, and to nothing once it stops", async () => {
    const { publish, runtime } = await installed();
    const progress = mock(() => {});

    expect(runtime().messages.hasProgressCallback()).toBe(false);
    runtime().messages.registerProgressCallback(progress);
    expect(runtime().messages.hasProgressCallback()).toBe(true);
    expect(progress).toHaveBeenLastCalledWith([]);
    await publish({ ...jobDone, status: "processing" });
    expect(progress).toHaveBeenLastCalledWith([
      expect.objectContaining({ id: "job-1", status: "processing" }),
    ]);

    runtime().messages.unregisterProgressCallback();
    const calls = progress.mock.calls.length;
    await publish(jobDone);

    expect(runtime().messages.hasProgressCallback()).toBe(false);
    expect(progress).toHaveBeenCalledTimes(calls);
  });

  it("registers no channel, in the worker or after registration", async () => {
    const { plugin } = await installed();
    const worker = createMockShell();
    await plugin.registerChannelsForExecution?.(worker);
    worker.getChannelRegistry().finalize();

    expect(worker.getChannelRegistry().listDescriptors()).toEqual([]);
    expect(worker.getDaemonRegistry().getAll()).toEqual([]);
  });

  it("is refused when declared twice", () => {
    const terminal = withMessageTransport(
      defineInterface({ id: "terminal", config }),
      () => ({ send: (): void => {} }),
    );

    expect(() =>
      withMessageTransport(terminal, () => ({ send: (): void => {} })),
    ).toThrow(
      'Interface "terminal" declares a message transport more than once',
    );
  });
});

describe("withChannels", () => {
  const recipients = defineInterface({
    id: "terminal",
    config: z.object({ apiKey: z.string().optional() }),
  });
  const deliveries: unknown[] = [];
  const withMailChannel = withChannels(recipients, (context) => {
    interfaceRuntime(context).logger.debug("channels");
    return [
      {
        descriptor: {
          type: "mail",
          displayName: "Mail",
          subjectLabel: "Address",
          subjectPattern: { source: "^.+@.+$", flags: "i" },
          manualDelivery: true,
        },
        ...(context.config.apiKey
          ? {
              delivery: {
                isAvailable: async (): Promise<boolean> => true,
                send: async (
                  input: unknown,
                ): Promise<{ status: "sent"; providerDeliveryId: string }> => {
                  deliveries.push(input);
                  return { status: "sent", providerDeliveryId: "m-1" };
                },
              },
            }
          : {}),
      },
    ];
  });
  const mailChannel = {
    type: "mail",
    displayName: "Mail",
    subjectLabel: "Address",
    subjectPattern: { source: "^.+@.+$", flags: "i" },
    manualDelivery: true,
  };
  const input = {
    recipient: "a@b.c",
    subject: "Hi",
    text: "Hello",
    idempotencyKey: "k-1",
    html: "<p>Hello</p>",
    sensitivity: "secret" as const,
    threading: { inReplyTo: "<m@b.c>", references: ["<m@b.c>"] },
  };

  it("registers each channel and its sender as written, in the main process", async () => {
    deliveries.length = 0;
    const shell = createMockShell();
    await instantiate(withMailChannel, { apiKey: "key" }).register(shell);
    const channels = shell.getChannelRegistry();
    channels.finalize();

    expect(channels.listDescriptors()).toEqual([mailChannel]);
    const provider = channels.getDeliveryProvider("mail");
    expect(await provider?.isAvailable()).toBe(true);
    expect(await provider?.send(input)).toEqual({
      status: "sent",
      providerDeliveryId: "m-1",
    });
    expect(deliveries).toEqual([input]);
  });

  it("registers the same in the worker, and nothing else", async () => {
    const worker = createMockShell();
    const plugin = instantiate(withMailChannel, { apiKey: "key" });
    await plugin.registerChannelsForExecution?.(worker);
    worker.getChannelRegistry().finalize();

    expect(worker.getChannelRegistry().listDescriptors()).toEqual([
      mailChannel,
    ]);
    expect(
      worker.getChannelRegistry().getDeliveryProvider("mail"),
    ).toBeDefined();
    expect(worker.getDaemonRegistry().getAll()).toEqual([]);
  });

  it("registers no sender for a channel that declares none", async () => {
    const shell = createMockShell();
    await instantiate(withMailChannel).register(shell);
    shell.getChannelRegistry().finalize();

    expect(shell.getChannelRegistry().listDescriptors()).toEqual([mailChannel]);
    expect(
      shell.getChannelRegistry().getDeliveryProvider("mail"),
    ).toBeUndefined();
  });

  it("is refused when declared twice", () => {
    expect(() => withChannels(withMailChannel, () => [])).toThrow(
      'Interface "terminal" declares its channels more than once',
    );
  });
});

describe("a daemon slot that declares none", () => {
  it("registers no daemon", async () => {
    const terminal = withDaemon(
      defineInterface({ id: "terminal", config }),
      () => undefined,
    );
    const shell = createMockShell();
    await instantiate(terminal).register(shell);

    expect(shell.getDaemonRegistry().getAll()).toEqual([]);
  });
});

describe("interfaceRuntime on the bus and in runtime state", () => {
  const lookup = defineBusContract({
    channel: "terminal:lookup",
    delivery: "request",
    request: z.object({ key: z.string() }),
    response: z.object({ value: z.string() }),
  });
  const runSchema = z.object({ uid: z.number() });

  async function installed(shell = createMockShell()): Promise<{
    runtime: InterfaceRuntime;
    plugin: ReturnType<typeof instantiate>;
    shell: ReturnType<typeof createMockShell>;
  }> {
    let reached: InterfaceRuntime | undefined;
    const terminal = defineInterface({
      id: "terminal",
      config,
      setup: (context) => {
        reached = interfaceRuntime(context);
        reached.answer(lookup, ({ request, sender }) => ({
          value: `${request.key} for ${sender}`,
        }));
        return {};
      },
    });
    const plugin = instantiate(terminal);
    await plugin.register(shell);
    if (!reached) throw new Error("Setup did not run");
    return { runtime: reached, plugin, shell };
  }

  it("answers a first-party contract under its channel, with the sender, until shutdown", async () => {
    const { runtime, plugin } = await installed();

    expect(await runtime.request(lookup, { key: "a" })).toEqual({
      status: "answered",
      data: { value: "a for terminal" },
    });
    await plugin.shutdown?.();

    expect(await runtime.request(lookup, { key: "a" })).toEqual({
      status: "unavailable",
    });
  });

  it("keeps runtime state under the namespace its class named", async () => {
    const shell = createMockShell();
    await shell
      .getRuntimeState()
      .scoped({ namespace: "terminal.cursor", schema: runSchema })
      .set("inbox", { uid: 4 });
    const { runtime } = await installed(shell);
    const cursor = runtime.classRuntimeState.scoped({
      namespace: "terminal.cursor",
      schema: runSchema,
    });

    expect(await cursor.get("inbox")).toEqual({ uid: 4 });
    await cursor.set("inbox", { uid: 5 });
    expect(
      await shell
        .getRuntimeState()
        .scoped({ namespace: "terminal.cursor", schema: runSchema })
        .get("inbox"),
    ).toEqual({ uid: 5 });
  });
});

describe("withWebRoutes", () => {
  const page = withWebRoutes(
    defineInterface({ id: "terminal", config, setup: () => ({ title: "Hi" }) }),
    ({ state }: { config: unknown; state: { title: string } }) => [
      {
        path: "/page",
        method: "GET",
        public: true,
        preview: true,
        handler: async (): Promise<Response> =>
          new Response(`<h1>${state.title}</h1>`, {
            headers: { "content-type": "text/html" },
          }),
      },
    ],
  );

  it("serves each route as written, after the plugin registers", async () => {
    const plugin = instantiate(page);
    const routesOf = (): unknown[] =>
      "getWebRoutes" in plugin && typeof plugin.getWebRoutes === "function"
        ? plugin.getWebRoutes()
        : [];
    expect(routesOf()).toEqual([]);
    await plugin.register(createMockShell());

    const [route] =
      "getWebRoutes" in plugin && typeof plugin.getWebRoutes === "function"
        ? plugin.getWebRoutes()
        : [];
    expect(route).toMatchObject({
      path: "/page",
      method: "GET",
      public: true,
      preview: true,
    });
    const response = await route?.handler(new Request("http://brain/page"));
    expect(response?.headers.get("content-type")).toBe("text/html");
    expect(await response?.text()).toBe("<h1>Hi</h1>");
  });

  it("serves them after the routes the definition declares", async () => {
    const both = withWebRoutes(
      defineInterface(
        { id: "terminal", config },
        {
          routes: () => [
            defineRoute({
              method: "GET",
              path: "/declared",
              security: { kind: "public" },
              response: z.object({ ok: z.boolean() }),
              handle: () => ({ ok: true }),
            }),
          ],
        },
      ),
      () => [
        {
          path: "/raw",
          method: "GET",
          public: true,
          handler: async (): Promise<Response> => new Response("raw"),
        },
      ],
    );
    const plugin = instantiate(both);
    await plugin.register(createMockShell());

    expect(
      ("getWebRoutes" in plugin && typeof plugin.getWebRoutes === "function"
        ? plugin.getWebRoutes()
        : []
      ).map((route) => route.path),
    ).toEqual(["/declared", "/raw"]);
  });
});

describe("withTools", () => {
  const echoed: unknown[] = [];
  const tooling = withTools(defineInterface({ id: "terminal", config }), () => [
    {
      name: "chat",
      description: "Talk to the brain",
      inputSchema: { message: z.string() },
      visibility: "public",
      sideEffects: "writes",
      agentTool: false,
      directMcpExposure: "basic",
      handler: async (input, context): Promise<ToolResponse> => {
        echoed.push({ input, interfaceType: context.interfaceType });
        return { success: true, data: { echoed: input } };
      },
    },
  ]);

  it("registers each tool under its name as written, run when the bus asks", async () => {
    echoed.length = 0;
    const shell = createMockShell();
    const capabilities = await instantiate(tooling).register(shell);

    expect(
      capabilities.tools.map(({ name, visibility, agentTool }) => ({
        name,
        visibility,
        agentTool,
      })),
    ).toEqual([{ name: "chat", visibility: "public", agentTool: false }]);
    const reply = await shell.getMessageBus().send({
      type: "plugin:terminal:tool:execute",
      payload: {
        toolName: "chat",
        args: { message: "hi" },
        interfaceType: "mcp",
        actor: { kind: "external", externalActorId: "mcp:http:someone" },
      },
      sender: "test",
    });

    expect(reply).toMatchObject({
      success: true,
      data: { success: true, data: { echoed: { message: "hi" } } },
    });
    expect(echoed).toEqual([
      { input: { message: "hi" }, interfaceType: "mcp" },
    ]);
  });
});

describe("withProtocolPlugin", () => {
  const protocolConfig = z.object({ mode: z.enum(["basic", "debug"]) });
  const protocol = withTools(
    defineInterface({ id: "terminal", config: protocolConfig }),
    ({ config: parsed }: { config: { mode: string }; state: unknown }) => [
      {
        name: `chat-${parsed.mode}`,
        description: "Talk",
        inputSchema: {},
        handler: async (): Promise<ToolResponse> => ({ success: true }),
      },
    ],
  );
  const hostConfig = z.object({
    mode: z.enum(["basic", "debug"]),
    port: z.number(),
  });
  const hosted = withProtocolPlugin(
    withDaemon(defineInterface({ id: "terminal", config: hostConfig }), () =>
      stoppedDaemon("terminal"),
    ),
    protocol,
    ({ mode }) => ({ mode }),
  );

  it("builds the protocol definition under the same id and package, from the host's config", async () => {
    const plugin = instantiate(hosted, { mode: "debug", port: 1 });
    if (
      !("createProtocolPlugin" in plugin) ||
      typeof plugin.createProtocolPlugin !== "function"
    ) {
      throw new Error("The hosted plugin offers no protocol plugin");
    }
    const created: unknown = plugin.createProtocolPlugin();
    if (!isPlugin(created)) throw new Error("Not a plugin");
    const shell = createMockShell();
    const capabilities = await created.register(shell);

    expect([created.id, created.packageName, created.version]).toEqual([
      plugin.id,
      plugin.packageName,
      plugin.version,
    ]);
    expect(capabilities.tools.map(({ name }) => name)).toEqual(["chat-debug"]);
    expect(shell.getDaemonRegistry().getAll()).toEqual([]);
  });

  it("offers none for a definition that declares none", () => {
    const plugin = instantiate(defineInterface({ id: "terminal", config }));

    expect("createProtocolPlugin" in plugin).toBe(false);
  });
});

describe("interfaceRuntime for a hosted protocol", () => {
  it("reads the brain's deployment, HTTP surface, auth, MCP transport and permission levels", async () => {
    const shell = createMockShell({
      domain: "brain.test",
      production: true,
      servesHttp: true,
    });
    const backend = createMockAuthBackend();
    shell.getAuthRegistry().bindBackend(backend);
    const permissions = new PermissionService({
      rules: [{ pattern: "terminal:stdio", level: "admin" }],
    });
    shell.getPermissionService = (): PermissionService => permissions;
    let runtime: InterfaceRuntime | undefined;
    await instantiate(
      defineInterface({
        id: "terminal",
        config,
        setup: (context) => {
          runtime = interfaceRuntime(context);
          return {};
        },
      }),
    ).register(shell);
    if (!runtime) throw new Error("Setup did not run");

    expect(runtime.production).toBe(true);
    expect(runtime.domain).toBe("brain.test");
    expect(runtime.servesHttp).toBe(true);
    expect(runtime.auth()).toBe(backend);
    expect(runtime.mcpTransport).toBe(shell.getMCPService());
    expect(runtime.permissions.getUserLevel("terminal", "stdio")).toBe("admin");
    expect(runtime.permissions.getUserLevel("terminal", "http")).toBe("public");
  });

  it("reads that the brain serves no HTTP where it serves none", async () => {
    const shell = createMockShell();
    let runtime: InterfaceRuntime | undefined;
    await instantiate(
      defineInterface({
        id: "terminal",
        config,
        setup: (context) => {
          runtime = interfaceRuntime(context);
          return {};
        },
      }),
    ).register(shell);

    expect(runtime?.servesHttp).toBe(false);
  });

  it("registers its endpoint and way in under the plugin", async () => {
    const shell = createMockShell();
    await instantiate(
      defineInterface({
        id: "terminal",
        config,
        setup: (context) => {
          const runtime = interfaceRuntime(context);
          runtime.endpoint({ label: "Terminal", url: "/t", priority: 5 });
          runtime.interaction({
            id: "terminal",
            label: "Terminal",
            href: "/t",
            kind: "protocol",
          });
          return {};
        },
      }),
    ).register(shell);

    expect(shell.listEndpoints()).toEqual([
      expect.objectContaining({
        label: "Terminal",
        url: "/t",
        pluginId: "terminal",
      }),
    ]);
    expect(shell.listInteractions()).toEqual([
      expect.objectContaining({ id: "terminal", pluginId: "terminal" }),
    ]);
  });

  it("hears a typed channel until the interface shuts down", async () => {
    const heard: unknown[] = [];
    const ping = defineChannel("terminal:ping", z.object({ n: z.number() }));
    const shell = createMockShell();
    const plugin = instantiate(
      defineInterface({
        id: "terminal",
        config,
        setup: (context) => {
          interfaceRuntime(context).listen(ping, ({ payload }) => {
            heard.push(payload);
          });
          return {};
        },
      }),
    );
    await plugin.register(shell);
    const send = (n: number): Promise<unknown> =>
      shell.getMessageBus().send({
        type: "terminal:ping",
        payload: { n },
        sender: "test",
        broadcast: true,
      });

    await send(1);
    await plugin.shutdown?.();
    await send(2);

    expect(heard).toEqual([{ n: 1 }]);
  });
});

function isPlugin(value: unknown): value is Plugin {
  return (
    typeof value === "object" &&
    value !== null &&
    "id" in value &&
    "register" in value
  );
}

describe("interfaceRuntime for a federated interface", () => {
  async function reach(
    shell: ReturnType<typeof createMockShell>,
  ): Promise<{ runtime: InterfaceRuntime; plugin: Plugin }> {
    let reached: InterfaceRuntime | undefined;
    const plugin = instantiate(
      defineInterface({
        id: "terminal",
        config,
        setup: (context) => {
          reached = interfaceRuntime(context);
          return {};
        },
      }),
    );
    await plugin.register(shell);
    if (!reached) throw new Error("Setup did not run");
    return { runtime: reached, plugin };
  }

  it("runs ready handlers in order once the brain is ready, not before", async () => {
    const shell = createMockShell();
    const { runtime, plugin } = await reach(shell);
    const ran: string[] = [];
    runtime.ready(() => {
      ran.push("first");
    });
    runtime.ready(async () => {
      ran.push("second");
    });

    expect(ran).toEqual([]);
    await plugin.ready?.();

    expect(ran).toEqual(["first", "second"]);
  });

  it("reads who the brain is, its profile kind, public skills and public tools", async () => {
    const shell = createMockShell();
    shell.listToolsForPermissionLevel = (level): ToolInfo[] =>
      level === "public"
        ? [{ name: "system_search", description: "Search", pluginId: "system" }]
        : [];
    shell.getProfileKindRegistry().finalize();
    const { runtime } = await reach(shell);

    expect(runtime.identity.get()).toEqual(shell.getIdentity());
    expect(runtime.identity.getProfile()).toEqual(shell.getProfile());
    expect(runtime.profileKinds.getResolved()).toEqual(
      shell.getProfileKindRegistry().getResolved(),
    );
    expect(runtime.tools.listForPermissionLevel("public")).toEqual([
      { name: "system_search", description: "Search", pluginId: "system" },
    ]);
    expect(await runtime.publicSkills.list()).toEqual([
      expect.objectContaining({ id: "system_search" }),
    ]);
  });

  it("reads entities at the scope each call names", async () => {
    const shell = createMockShell();
    shell.addEntities([
      {
        id: "peer.example",
        entityType: "agent",
        content: "",
        metadata: { name: "Peer", status: "approved" },
        visibility: "public",
        contentHash: "h-1",
        created: "2026-11-01T00:00:00.000Z",
        updated: "2026-11-01T00:00:00.000Z",
      },
      {
        id: "private.example",
        entityType: "agent",
        content: "",
        metadata: { name: "Private", status: "approved" },
        visibility: "restricted",
        contentHash: "h-2",
        created: "2026-11-01T00:00:00.000Z",
        updated: "2026-11-01T00:00:00.000Z",
      },
    ]);
    const { runtime } = await reach(shell);

    expect(
      (
        await runtime.entityReads.listEntities({
          entityType: "agent",
          options: { filter: { visibilityScope: "public" } },
        })
      ).map(({ id }) => id),
    ).toEqual(["peer.example"]);
    expect(
      await runtime.entityReads.getEntity({
        entityType: "agent",
        id: "private.example",
        visibilityScope: "public",
      }),
    ).toBeNull();
  });
});

describe("interfaceRuntime uploads", () => {
  async function reach(dataDir: string): Promise<InterfaceRuntime> {
    let reached: InterfaceRuntime | undefined;
    await instantiate(
      defineInterface({
        id: "terminal",
        config,
        setup: (context) => {
          reached = interfaceRuntime(context);
          return {};
        },
      }),
    ).register(createMockShell({ dataDir }));
    if (!reached) throw new Error("Setup did not run");
    return reached;
  }

  it("writes the runtime's shared upload store, at the route it names", async () => {
    const dataDir = await createTempDataDir("brains-shared-uploads-");
    const runtime = await reach(dataDir);
    const store = runtime.sharedUploads({ routePath: "/api/web/uploads" });

    const record = await store.save({
      filename: "notes.md",
      mediaType: "text/markdown",
      content: new TextEncoder().encode("# Notes"),
    });

    expect(record.ref).toEqual({ kind: "upload", id: record.id });
    expect(store.toResponseBody(record).url).toBe(
      `/api/web/uploads?id=${record.id}`,
    );
    expect(existsSync(join(dataDir, "upload", "uploads", record.id))).toBe(
      true,
    );
    expect(runtime.sharedUploads().toResponseBody(record).url).toBe(
      `/api/chat/uploads?id=${record.id}`,
    );
  });

  it("retires a retired upload directory once, touching nothing else", async () => {
    const dataDir = await createTempDataDir("brains-retired-uploads-");
    mkdirSync(join(dataDir, "discord-chat", "uploads", "upload-1"), {
      recursive: true,
    });
    writeFileSync(
      join(dataDir, "discord-chat", "uploads", "upload-1", "content"),
      "old",
    );
    writeFileSync(join(dataDir, "discord-chat", "keep.txt"), "keep");
    mkdirSync(join(dataDir, "upload", "uploads", "upload-2"), {
      recursive: true,
    });
    mkdirSync(join(dataDir, "slack-chat", "uploads"), { recursive: true });
    const runtime = await reach(dataDir);

    expect(await runtime.retireUploads("discord-chat")).toBe(true);
    expect(existsSync(join(dataDir, "discord-chat", "uploads"))).toBe(false);
    expect(existsSync(join(dataDir, "discord-chat", "keep.txt"))).toBe(true);
    expect(existsSync(join(dataDir, "upload", "uploads", "upload-2"))).toBe(
      true,
    );
    expect(existsSync(join(dataDir, "slack-chat", "uploads"))).toBe(true);
    // Once gone, retiring it again changes nothing.
    expect(await runtime.retireUploads("discord-chat")).toBe(false);
    expect(existsSync(join(dataDir, "discord-chat", "keep.txt"))).toBe(true);
  });

  it("refuses to retire the shared store or a name outside the data directory", async () => {
    const runtime = await reach(await createTempDataDir("brains-refuse-"));

    expect(runtime.retireUploads("upload")).rejects.toThrow(
      "the runtime's shared upload store is never retired",
    );
    expect(runtime.retireUploads("../upload")).rejects.toThrow(
      "is not an upload namespace",
    );
  });
});

describe("interfaceRuntime for a chat platform", () => {
  it("reads the brain's spaces and site URLs, gathers answers and writes conversations", async () => {
    const started: unknown[] = [];
    const added: unknown[] = [];
    const shell = createMockShell({
      spaces: ["discord:guild-1"],
      domain: "brain.test",
      localSiteUrl: "http://localhost:8080",
      preferLocalUrls: true,
      conversationService: {
        startConversation: async (request) => {
          started.push(request);
          return "conv-1";
        },
        addMessage: async (request) => {
          added.push(request);
        },
        getMessages: async () => [],
        countMessages: async () => 0,
        getConversation: async () => null,
        listConversations: async () => [],
        searchConversations: async () => [],
        updateConversationMetadata: async () => false,
        deleteConversation: async () => false,
        deleteExpiredGuestConversations: async () => 0,
        close: () => {},
      },
    });
    const poll = defineBusContract({
      channel: "terminal:poll",
      delivery: "collect",
      request: z.object({ q: z.string() }),
      response: z.object({ a: z.string() }),
    });
    let runtime: InterfaceRuntime | undefined;
    await instantiate(
      defineInterface({
        id: "terminal",
        config,
        setup: (context) => {
          runtime = interfaceRuntime(context);
          return {};
        },
      }),
    ).register(shell);
    if (!runtime) throw new Error("Setup did not run");
    shell.getMessageBus().subscribe("terminal:poll", async () => ({
      success: true,
      data: { a: "yes" },
    }));

    expect(runtime.spaces).toEqual(["discord:guild-1"]);
    expect(runtime.siteUrl).toBe("https://brain.test");
    expect(runtime.localSiteUrl).toBe("http://localhost:8080");
    expect(runtime.preferLocalUrls).toBe(true);
    expect(await runtime.gather(poll, { q: "ok?" })).toMatchObject({
      status: "answered",
      answers: [{ a: "yes" }],
    });
    await runtime.conversations.start({
      sessionId: "conv-1",
      interfaceType: "terminal",
      channelId: "room",
      metadata: {
        channelName: "Room",
        interfaceType: "terminal",
        channelId: "room",
      },
    });
    await runtime.conversations.addMessage({
      conversationId: "conv-1",
      role: "user",
      content: "hi",
    });
    expect(started).toEqual([
      {
        sessionId: "conv-1",
        interfaceType: "terminal",
        channelId: "room",
        metadata: {
          channelName: "Room",
          interfaceType: "terminal",
          channelId: "room",
        },
      },
    ]);
    expect(added).toEqual([
      { conversationId: "conv-1", role: "user", content: "hi" },
    ]);
  });
});

describe("a message transport that renders and edits", () => {
  interface Recorded {
    sent: unknown[];
    edits: unknown[];
    statuses: unknown[];
    rerouted: unknown[];
  }

  async function installed(): Promise<{
    recorded: Recorded;
    shell: ReturnType<typeof createMockShell>;
    runtime: () => InterfaceRuntime;
  }> {
    const recorded: Recorded = {
      sent: [],
      edits: [],
      statuses: [],
      rerouted: [],
    };
    let reached: InterfaceRuntime | undefined;
    const terminal = withMessageTransport(
      defineInterface({ id: "terminal", config }),
      (context) => {
        reached = interfaceRuntime(context);
        return {
          send: (request): void => {
            recorded.sent.push(request);
          },
          sendWithId: async (request): Promise<string> => {
            recorded.sent.push(request);
            return `message-${recorded.sent.length}`;
          },
          edit: async (request): Promise<boolean> => {
            recorded.edits.push(request);
            return true;
          },
          formatProgress: (event): { card: unknown; fallbackText: string } => ({
            card: { progress: event.id },
            fallbackText: `working on ${event.id}`,
          }),
          formatCompletion: (event): string => `done: ${event.id}`,
          // A platform's own interface type is this one's.
          progressEvent: async (event, next): Promise<void> => {
            recorded.rerouted.push(event.metadata.interfaceType);
            await next({
              ...event,
              metadata: { ...event.metadata, interfaceType: "terminal" },
            });
          },
          toolActivity: async (event, next): Promise<void> => {
            await next({ ...event, interfaceType: "terminal" });
          },
          toolStatus: async (update): Promise<void> => {
            recorded.statuses.push({
              tool: update.toolName,
              state: update.state,
            });
          },
        };
      },
    );
    const shell = createMockShell();
    await instantiate(terminal).register(shell);
    return {
      recorded,
      shell,
      runtime: (): InterfaceRuntime => {
        if (!reached) throw new Error("The transport slot did not run");
        return reached;
      },
    };
  }

  const progress = (
    status: string,
    interfaceType = "terminal-discord",
  ): Record<string, unknown> => ({
    id: "job-1",
    type: "job",
    status,
    metadata: {
      rootJobId: "job-1",
      operationType: "file_operations",
      interfaceType,
      channelId: "room",
    },
  });
  const publish = (
    shell: ReturnType<typeof createMockShell>,
    type: string,
    payload: unknown,
  ): Promise<unknown> =>
    shell
      .getMessageBus()
      .send({ type, payload, sender: "test", broadcast: true });

  it("sends progress through sendWithId, edits it on completion, as the transport renders it", async () => {
    const { recorded, shell } = await installed();

    await publish(shell, "job-progress", progress("processing"));
    await publish(shell, "job-progress", progress("completed"));

    expect(recorded.rerouted).toEqual(["terminal-discord", "terminal-discord"]);
    expect(recorded.sent).toEqual([
      {
        channelId: "room",
        message: {
          card: { progress: "job-1" },
          fallbackText: "working on job-1",
        },
      },
    ]);
    expect(recorded.edits).toEqual([
      { channelId: "room", messageId: "message-1", message: "done: job-1" },
    ]);
  });

  it("edits the reply it tracks for a job when the job completes", async () => {
    const { recorded, shell, runtime } = await installed();

    runtime().messages.trackAgentResponseForJob("job-1", "reply-1", "room");
    await publish(shell, "job-progress", progress("completed"));

    expect(recorded.edits).toEqual([
      { channelId: "room", messageId: "reply-1", message: "done: job-1" },
    ]);
  });

  it("hands tool statuses, rerouted by its tool-activity hook, to the transport", async () => {
    const { recorded, shell } = await installed();
    const event = {
      toolName: "system_search",
      conversationId: "conv-1",
      interfaceType: "terminal-slack",
      channelId: "room",
      actor: { kind: "external", externalActorId: "terminal:someone" },
    };

    await publish(shell, "tool:invoking", event);
    await publish(shell, "tool:failed", { ...event, error: "boom" });

    expect(recorded.statuses).toEqual([
      { tool: "system_search", state: "running" },
      { tool: "system_search", state: "failed" },
    ]);
  });

  it("resolves a tool completion held during input once the reply settles it", async () => {
    const { recorded, shell, runtime } = await installed();
    const event = {
      toolName: "system_search",
      conversationId: "conv-1",
      interfaceType: "terminal",
      channelId: "room",
      actor: { kind: "external", externalActorId: "terminal:someone" },
    };

    runtime().messages.startProcessingInput("room");
    await publish(shell, "tool:completed", event);
    expect(recorded.statuses).toEqual([]);
    await runtime().messages.handleAgentResponseToolStatuses(
      { cards: [], pendingConfirmations: [] },
      "conv-1",
    );
    runtime().messages.endProcessingInput();

    expect(recorded.statuses).toEqual([
      { tool: "system_search", state: "completed" },
    ]);
  });
});

describe("captureUrlViaAgent", () => {
  it("asks the agent to save the link in the channel's link conversation, at the author's level", async () => {
    const chat = mock<IAgentService["chat"]>(async () => ({
      text: "Saved",
      usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
    }));
    const permissions = new PermissionService({
      rules: [{ pattern: "discord:author-1", level: "trusted" }],
    });

    await captureUrlViaAgent(
      {
        agent: { chat },
        permissions: {
          getUserLevel: (type, id, lookup) =>
            permissions.determineUserLevel(type, id, lookup),
        },
      },
      "https://example.com/a",
      "room-1",
      "author-1",
      "discord",
    );

    expect(chat).toHaveBeenCalledWith(
      "Save this link: https://example.com/a",
      "links-room-1",
      {
        userPermissionLevel: "trusted",
        interfaceType: "discord",
        channelId: "room-1",
      },
    );
  });
});

describe("interfaceRuntime for a web chat", () => {
  async function reach(
    shell: ReturnType<typeof createMockShell>,
  ): Promise<{ runtime: InterfaceRuntime; plugin: Plugin }> {
    let reached: InterfaceRuntime | undefined;
    const plugin = instantiate(
      defineInterface({
        id: "terminal",
        config,
        setup: (context) => {
          reached = interfaceRuntime(context);
          return {};
        },
      }),
    );
    await plugin.register(shell);
    if (!reached) throw new Error("Setup did not run");
    return { runtime: reached, plugin };
  }

  it("reads the brain's app info, theme, preview URL, guest readiness and a role's route", async () => {
    const shell = createMockShell({ domain: "brain.test" });
    const { runtime } = await reach(shell);

    expect((await runtime.identity.getAppInfo()).ai.model).toEqual(
      expect.any(String),
    );
    expect(runtime.themeCSS).toEqual(expect.any(String));
    expect(runtime.previewUrl).toBe("https://preview.brain.test");
    expect(runtime.agent.guestReady).toBe(false);
    expect(runtime.routeByRole("dashboard")).toBeUndefined();
  });

  it("reads and changes conversations as the class did", async () => {
    const calls: string[] = [];
    const shell = createMockShell({
      conversationService: {
        startConversation: async () => "conv-1",
        addMessage: async () => {},
        getMessages: async () => [],
        countMessages: async () => 0,
        getConversation: async (id) => {
          calls.push(`get:${id}`);
          return null;
        },
        listConversations: async () => {
          calls.push("list");
          return [];
        },
        searchConversations: async () => [],
        updateConversationMetadata: async (request) => {
          calls.push(`update:${request.conversationId}`);
          return true;
        },
        deleteConversation: async (id) => {
          calls.push(`delete:${id}`);
          return true;
        },
        deleteExpiredGuestConversations: async () => 0,
        close: () => {},
      },
    });
    const { runtime } = await reach(shell);

    await runtime.conversations.get("conv-1");
    await runtime.conversations.list();
    await runtime.conversations.updateMetadata({
      conversationId: "conv-1",
      metadata: { title: "Hi" },
    });
    await runtime.conversations.delete("conv-1");

    expect(calls).toEqual([
      "get:conv-1",
      "list",
      "update:conv-1",
      "delete:conv-1",
    ]);
  });

  it("registers operational health, reads Inbox sources and job status, and composes Studio", async () => {
    const shell = createMockShell();
    const { runtime } = await reach(shell);

    runtime.operationalHealth("guest-usage-record", async () => ({
      status: "healthy",
      message: "ok",
    }));
    expect(
      (await shell.getOperationalHealthRegistry().getChecks()).map(
        ({ name }) => name,
      ),
    ).toContain("terminal:guest-usage-record");
    shell.getInboxRegistry().finalize();
    expect(runtime.inbox.getSource("missing")).toBeUndefined();
    expect(await runtime.jobs.getStatus("job-missing")).toBeNull();
    expect(runtime.studio.isAvailable()).toBe(false);
  });
});
