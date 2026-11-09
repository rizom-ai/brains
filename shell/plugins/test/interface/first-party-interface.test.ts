import { describe, expect, it, mock } from "bun:test";
import { PermissionService } from "@brains/templates";
import { createSilentLogger } from "@brains/test-utils";
import { z } from "@brains/utils/zod";
import type { IAgentService } from "@brains/ai-service";
import type { IConversationService } from "@brains/conversation-service";
import { createMockShell } from "../../src/test/mock-shell";
import {
  defineDaemon,
  defineInterface,
  defineMessageInterface,
  instantiatePluginPackageDefinition,
  interfaceRuntime,
  withDaemon,
  withMessageTransport,
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
