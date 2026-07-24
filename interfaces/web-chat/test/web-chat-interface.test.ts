import {
  AGENT_ACTION_REQUEST_CHANNEL,
  createExternalActorId,
} from "@brains/contracts";
import type { AuthPrincipal } from "@brains/auth-service";
import { describe, expect, it, beforeEach, afterEach } from "bun:test";
import type {
  IAgentService,
  IConversationService,
  WebRouteDefinition,
  WebRouteMethod,
} from "@brains/plugins";
import {
  createPluginHarness,
  type PluginTestHarness,
} from "@brains/plugins/test";
import { join } from "path";
import { mkdir, rm, utimes, writeFile } from "fs/promises";
import { WebChatInterface } from "../src";

type ChatContext = Parameters<IAgentService["chat"]>[2];
type AgentResponse = Awaited<ReturnType<IAgentService["chat"]>>;
type Conversation = NonNullable<
  Awaited<ReturnType<IConversationService["getConversation"]>>
>;
type Message = Awaited<ReturnType<IConversationService["getMessages"]>>[number];
type JobStatus = Awaited<
  ReturnType<ReturnType<PluginTestHarness["getMockShell"]>["jobs"]["getStatus"]>
>;

interface AgentChatCall {
  message: string;
  conversationId: string;
  context: ChatContext | undefined;
}

interface AgentConfirmCall {
  conversationId: string;
  confirmed: boolean;
  approvalId: string | undefined;
  context: ChatContext;
}

function makeJobStatus(
  jobId: string,
  status: "pending" | "processing" | "completed" | "failed",
  lastError: string | null = null,
): NonNullable<JobStatus> {
  return {
    id: jobId,
    type: "document_generate",
    data: "{}",
    status,
    source: "test",
    priority: 0,
    retryCount: 0,
    maxRetries: 3,
    lastError,
    createdAt: Date.now(),
    scheduledFor: Date.now(),
    startedAt: status === "pending" ? null : Date.now(),
    completedAt:
      status === "completed" || status === "failed" ? Date.now() : null,
    metadata: {
      operationType: "content_operations",
      rootJobId: jobId,
    },
    result: null,
  };
}

function createSpyAgentService(
  chatResponse: AgentResponse = {
    text: "Mock agent response",
    usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
  },
  confirmResponse: AgentResponse = {
    text: "Action confirmed.",
    usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
  },
): IAgentService & {
  readonly chatCalls: ReadonlyArray<AgentChatCall>;
  readonly confirmCalls: ReadonlyArray<AgentConfirmCall>;
} {
  const calls: AgentChatCall[] = [];
  const confirmCalls: AgentConfirmCall[] = [];
  return {
    get chatCalls(): ReadonlyArray<AgentChatCall> {
      return calls;
    },
    get confirmCalls(): ReadonlyArray<AgentConfirmCall> {
      return confirmCalls;
    },
    chat: async (
      message: string,
      conversationId: string,
      context?: ChatContext,
    ): Promise<AgentResponse> => {
      calls.push({ message, conversationId, context });
      return chatResponse;
    },
    confirmPendingAction: async (
      conversationId: string,
      confirmed: boolean,
      approvalId: string,
      context: ChatContext,
    ): Promise<AgentResponse> => {
      confirmCalls.push({ conversationId, confirmed, approvalId, context });
      return confirmResponse;
    },
    invalidateAgent: (): void => {},
  };
}

function makeConversation(
  id: string,
  interfaceType: string,
  overrides: Partial<Conversation> = {},
): Conversation {
  return {
    id,
    sessionId: id,
    interfaceType,
    channelId: id,
    personId: null,
    started: "2026-05-24T00:00:00.000Z",
    lastActive: "2026-05-24T00:01:00.000Z",
    created: "2026-05-24T00:00:00.000Z",
    updated: "2026-05-24T00:01:00.000Z",
    metadata: JSON.stringify({ channelName: "Web Chat" }),
    ...overrides,
  };
}

function makeMessage(
  id: string,
  conversationId: string,
  role: Message["role"],
  content: string,
  metadata: Message["metadata"] = null,
): Message {
  return {
    id,
    conversationId,
    role,
    content,
    timestamp: "2026-05-24T00:00:30.000Z",
    metadata,
  };
}

function makeFixedConversationService(input: {
  conversations: Conversation[];
  messagesByConversation: Record<string, Message[]>;
  startConversation?: IConversationService["startConversation"];
  addMessage?: IConversationService["addMessage"];
  updateConversationMetadata?: (request: {
    conversationId: string;
    metadata: Record<string, unknown>;
  }) => Promise<boolean>;
  deleteConversation?: (conversationId: string) => Promise<boolean>;
}): IConversationService {
  return {
    startConversation:
      input.startConversation ?? (async (): Promise<string> => "web-session"),
    addMessage: input.addMessage ?? (async (): Promise<void> => {}),
    getConversation: async (conversationId: string) =>
      input.conversations.find((c) => c.id === conversationId) ?? null,
    listConversations: async (options) =>
      input.conversations.filter(
        (c) =>
          (options?.interfaceType === undefined ||
            c.interfaceType === options.interfaceType) &&
          (options?.personId === undefined || c.personId === options.personId),
      ),
    searchConversations: async () => [],
    getMessages: async (conversationId: string) =>
      input.messagesByConversation[conversationId] ?? [],
    countMessages: async (conversationId: string) =>
      (input.messagesByConversation[conversationId] ?? []).length,
    updateConversationMetadata:
      input.updateConversationMetadata ?? (async (): Promise<boolean> => true),
    deleteConversation:
      input.deleteConversation ?? (async (): Promise<boolean> => true),
    close: (): void => {},
  };
}

function adminPlugin(): WebChatInterface {
  return new WebChatInterface({}, { resolveAuthSession: async () => true });
}

function trustedPlugin(): WebChatInterface {
  return new WebChatInterface(
    {},
    { resolvePermissionLevel: async () => "trusted" },
  );
}

function trustedPrincipal(
  overrides: Partial<AuthPrincipal> = {},
): AuthPrincipal {
  return {
    userId: "usr_collaborator",
    personId: "prsn_collaborator",
    displayName: "Collaborator",
    role: "trusted",
    status: "active",
    permissionLevel: "trusted",
    canonicalId: "user:collaborator",
    isAnchor: false,
    ...overrides,
  };
}

function trustedAuthPlugin(): WebChatInterface {
  return new WebChatInterface(
    {},
    { resolveAuthPrincipal: async () => trustedPrincipal() },
  );
}

function textDataUrl(content: string): string {
  return `data:text/plain;base64,${Buffer.from(content, "utf8").toString("base64")}`;
}

function pngBytes(): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(new ArrayBuffer(8));
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  return bytes;
}

function pngDataUrl(bytes = pngBytes()): string {
  return `data:image/png;base64,${Buffer.from(bytes).toString("base64")}`;
}

function getRoute(
  plugin: WebChatInterface,
  path: string,
  method: WebRouteMethod,
): WebRouteDefinition | undefined {
  const route = plugin
    .getWebRoutes()
    .find(
      (candidate) => candidate.path === path && candidate.method === method,
    );
  if (!route) {
    throw new Error(`Missing ${method} ${path} route`);
  }
  return route;
}

function requireRoute(
  plugin: WebChatInterface,
  path: string,
  method: WebRouteMethod,
): WebRouteDefinition {
  const route = getRoute(plugin, path, method);
  if (!route) throw new Error(`Missing ${method} ${path} route`);
  return route;
}

describe("WebChatInterface", () => {
  let harness: PluginTestHarness<WebChatInterface>;

  beforeEach(() => {
    harness = createPluginHarness<WebChatInterface>();
    const conversations: Conversation[] = [];
    harness.getMockShell().setConversationService(
      makeFixedConversationService({
        conversations,
        messagesByConversation: {},
        startConversation: async (request): Promise<string> => {
          if (!conversations.some((item) => item.id === request.sessionId)) {
            conversations.push(
              makeConversation(request.sessionId, request.interfaceType, {
                channelId: request.channelId,
                personId: request.personId ?? null,
                metadata: JSON.stringify(request.metadata),
              }),
            );
          }
          return request.sessionId;
        },
      }),
    );
  });

  afterEach(() => {
    harness.reset();
  });

  it("registers as the web-chat interface", async () => {
    const plugin = new WebChatInterface();

    await harness.installPlugin(plugin);

    expect(plugin.id).toBe("web-chat");
    expect(plugin.type).toBe("interface");
    expect(plugin.packageName).toBe("@brains/web-chat");
    expect(harness.getMockShell().listEndpoints()).toContainEqual(
      expect.objectContaining({
        pluginId: "web-chat",
        label: "Chat",
        visibility: "trusted",
      }),
    );
  });

  it("exposes chat page, AI SDK endpoint, and UI asset routes", async () => {
    const plugin = new WebChatInterface();
    await harness.installPlugin(plugin);

    const routes = plugin.getWebRoutes();

    expect(routes).toHaveLength(16);
    expect(routes[0]).toMatchObject({
      path: "/chat",
      method: "GET",
      public: true,
    });
    expect(routes[1]).toMatchObject({
      path: "/api/chat",
      method: "POST",
      public: true,
    });
    expect(routes[2]).toMatchObject({
      path: "/api/chat/actions",
      method: "POST",
      public: true,
    });
    expect(routes[3]).toMatchObject({
      path: "/api/chat/sessions",
      method: "GET",
      public: true,
    });
    expect(routes[4]).toMatchObject({
      path: "/api/chat/sessions",
      method: "DELETE",
      public: true,
    });
    expect(routes[5]).toMatchObject({
      path: "/api/chat/sessions",
      method: "PUT",
      public: true,
    });
    expect(routes[6]).toMatchObject({
      path: "/api/chat/sessions/archive",
      method: "PUT",
      public: true,
    });
    expect(routes[7]).toMatchObject({
      path: "/api/chat/messages",
      method: "GET",
      public: true,
    });
    expect(routes[8]).toMatchObject({
      path: "/api/chat/attachments/document",
      method: "GET",
      public: true,
    });
    expect(routes[9]).toMatchObject({
      path: "/api/chat/attachments/image",
      method: "GET",
      public: true,
    });
    expect(routes[10]).toMatchObject({
      path: "/api/chat/jobs/status",
      method: "GET",
      public: true,
    });
    expect(routes[11]).toMatchObject({
      path: "/chat/assets/app.js",
      method: "GET",
      public: true,
    });
    expect(routes[12]).toMatchObject({
      path: "/api/chat/uploads",
      method: "POST",
      public: true,
    });
    expect(routes[13]).toMatchObject({
      path: "/api/chat/uploads",
      method: "GET",
      public: true,
    });
    expect(routes[14]).toMatchObject({
      path: "/api/agent/chat",
      method: "POST",
      public: true,
    });
    expect(routes[15]).toMatchObject({
      path: "/api/agent/chat/confirm",
      method: "POST",
      public: true,
    });
  });

  it("routes Trusted event actions at exact Trusted permission without model chat", async () => {
    harness.getMockShell().setConversationService(
      makeFixedConversationService({
        conversations: [
          makeConversation("web-session", "web-chat", {
            personId: "prsn_collaborator",
          }),
        ],
        messagesByConversation: { "web-session": [] },
      }),
    );
    const plugin = trustedAuthPlugin();
    const agent = createSpyAgentService();
    harness.setAgentService(agent);
    await harness.installPlugin(plugin);
    const received: unknown[] = [];
    harness.subscribe(AGENT_ACTION_REQUEST_CHANNEL, async (message) => {
      received.push(message.payload);
      return {
        success: true,
        data: {
          text: "Continuing onboarding.",
          toolResults: [
            {
              toolName: "playbook_send_event",
              args: { event: "NEXT" },
              data: { currentState: "identity" },
            },
          ],
          usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
        },
      };
    });

    const route = getRoute(plugin, "/api/chat/actions", "POST");
    const response = await route?.handler(
      new Request("http://brain/api/chat/actions", {
        method: "POST",
        body: JSON.stringify({
          conversationId: "web-session",
          action: { type: "event", event: "NEXT" },
        }),
      }),
    );

    expect(response?.status).toBe(200);
    expect(await response?.json()).toEqual({
      text: "Continuing onboarding.",
      toolResults: [
        {
          toolName: "playbook_send_event",
          args: { event: "NEXT" },
          data: { currentState: "identity" },
        },
      ],
      usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
    });
    expect(received).toEqual([
      {
        conversationId: "web-session",
        interfaceType: "web-chat",
        channelName: "Web Chat",
        userPermissionLevel: "trusted",
        isAnchor: false,
        action: { type: "event", event: "NEXT" },
      },
    ]);
    expect(agent.chatCalls).toHaveLength(0);
  });

  it("returns 404 before routing an action for another person's conversation", async () => {
    harness.getMockShell().setConversationService(
      makeFixedConversationService({
        conversations: [
          makeConversation("foreign-session", "web-chat", {
            personId: "prsn_other",
          }),
        ],
        messagesByConversation: { "foreign-session": [] },
      }),
    );
    const plugin = trustedAuthPlugin();
    await harness.installPlugin(plugin);
    const received: unknown[] = [];
    harness.subscribe(AGENT_ACTION_REQUEST_CHANNEL, async (message) => {
      received.push(message.payload);
      return { success: true, data: { text: "Must not run" } };
    });

    const response = await requireRoute(
      plugin,
      "/api/chat/actions",
      "POST",
    ).handler(
      new Request("http://brain/api/chat/actions", {
        method: "POST",
        body: JSON.stringify({
          conversationId: "foreign-session",
          action: { type: "event", event: "NEXT" },
        }),
      }),
    );

    expect(response.status).toBe(404);
    expect(received).toEqual([]);
  });

  it("serves remote-agent chat JSON with server-derived Trusted permission", async () => {
    const plugin = trustedAuthPlugin();
    const agent = createSpyAgentService({
      text: "Remote response",
      usage: { promptTokens: 1, completionTokens: 2, totalTokens: 3 },
    });
    harness.setAgentService(agent);
    await harness.installPlugin(plugin);
    const route = getRoute(plugin, "/api/agent/chat", "POST");

    const response = await route?.handler(
      new Request("http://brain/api/agent/chat", {
        method: "POST",
        body: JSON.stringify({
          message: "Evaluate this",
          conversationId: "remote-conversation",
        }),
      }),
    );

    expect(response?.status).toBe(200);
    expect(await response?.json()).toEqual({
      text: "Remote response",
      usage: { promptTokens: 1, completionTokens: 2, totalTokens: 3 },
    });
    expect(agent.chatCalls).toEqual([
      {
        message: "Evaluate this",
        conversationId: "remote-conversation",
        context: {
          userPermissionLevel: "trusted",
          isAnchor: false,
          interfaceType: "remote-agent",
          channelId: "remote-conversation",
          channelName: "Remote Agent",
          actor: {
            identity: {
              kind: "user",
              userId: "usr_collaborator",
              canonicalId: "user:collaborator",
            },
            interfaceType: "remote-agent",
            role: "user",
            displayName: "Collaborator",
          },
        },
      },
    ]);
  });

  it("creates remote-agent conversations with the server-derived person owner", async () => {
    const startCalls: Parameters<
      IConversationService["startConversation"]
    >[0][] = [];
    const conversations: Conversation[] = [];
    harness.getMockShell().setConversationService(
      makeFixedConversationService({
        conversations,
        messagesByConversation: {},
        startConversation: async (request): Promise<string> => {
          startCalls.push(request);
          conversations.push(
            makeConversation(request.sessionId, request.interfaceType, {
              personId: request.personId ?? null,
            }),
          );
          return request.sessionId;
        },
      }),
    );
    const plugin = trustedAuthPlugin();
    const agent = createSpyAgentService();
    harness.setAgentService(agent);
    await harness.installPlugin(plugin);

    const response = await requireRoute(
      plugin,
      "/api/agent/chat",
      "POST",
    ).handler(
      new Request("http://brain/api/agent/chat", {
        method: "POST",
        body: JSON.stringify({
          message: "Evaluate this",
          conversationId: "remote-owned",
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(startCalls).toEqual([
      {
        sessionId: "remote-owned",
        interfaceType: "remote-agent",
        channelId: "remote-owned",
        personId: "prsn_collaborator",
        metadata: {
          channelName: "Remote Agent",
          interfaceType: "remote-agent",
          channelId: "remote-owned",
        },
      },
    ]);
  });

  it("rejects remote-agent chat and confirmation for another person's conversation", async () => {
    harness.getMockShell().setConversationService(
      makeFixedConversationService({
        conversations: [
          makeConversation("remote-foreign", "remote-agent", {
            personId: "prsn_other",
          }),
        ],
        messagesByConversation: { "remote-foreign": [] },
      }),
    );
    const plugin = trustedAuthPlugin();
    const agent = createSpyAgentService();
    harness.setAgentService(agent);
    await harness.installPlugin(plugin);

    const chat = await requireRoute(plugin, "/api/agent/chat", "POST").handler(
      new Request("http://brain/api/agent/chat", {
        method: "POST",
        body: JSON.stringify({
          message: "Read it",
          conversationId: "remote-foreign",
        }),
      }),
    );
    const confirmation = await requireRoute(
      plugin,
      "/api/agent/chat/confirm",
      "POST",
    ).handler(
      new Request("http://brain/api/agent/chat/confirm", {
        method: "POST",
        body: JSON.stringify({
          conversationId: "remote-foreign",
          approvalId: "approval-1",
          confirmed: true,
        }),
      }),
    );

    expect([chat.status, confirmation.status]).toEqual([404, 404]);
    expect(agent.chatCalls).toEqual([]);
    expect(agent.confirmCalls).toEqual([]);
  });

  it("serves remote-agent confirmation JSON through the agent", async () => {
    harness.getMockShell().setConversationService(
      makeFixedConversationService({
        conversations: [
          makeConversation("remote-conversation", "remote-agent"),
        ],
        messagesByConversation: { "remote-conversation": [] },
      }),
    );
    const plugin = adminPlugin();
    const agent = createSpyAgentService(undefined, {
      text: "Remote confirmed",
      usage: { promptTokens: 1, completionTokens: 2, totalTokens: 3 },
    });
    harness.setAgentService(agent);
    await harness.installPlugin(plugin);
    const route = getRoute(plugin, "/api/agent/chat/confirm", "POST");

    const response = await route?.handler(
      new Request("http://brain/api/agent/chat/confirm", {
        method: "POST",
        body: JSON.stringify({
          conversationId: "remote-conversation",
          approvalId: "approval-1",
          confirmed: true,
        }),
      }),
    );

    expect(response?.status).toBe(200);
    expect(await response?.json()).toEqual({
      text: "Remote confirmed",
      usage: { promptTokens: 1, completionTokens: 2, totalTokens: 3 },
    });
    expect(agent.confirmCalls).toEqual([
      {
        conversationId: "remote-conversation",
        confirmed: true,
        approvalId: "approval-1",
        context: {
          userPermissionLevel: "admin",
          isAnchor: false,
          interfaceType: "remote-agent",
          channelId: "remote-conversation",
          channelName: "Remote Agent",
          actor: {
            identity: {
              kind: "external",
              externalActorId: createExternalActorId(
                "remote-agent",
                "remote-agent:remote-conversation:browser-user",
              ),
            },
            interfaceType: "remote-agent",
            role: "user",
            displayName: "Remote agent user",
          },
        },
      },
    ]);
  });

  it("rejects remote-agent JSON requests without an auth session", async () => {
    const plugin = new WebChatInterface(
      {},
      { resolveAuthSession: async (): Promise<boolean> => false },
    );
    await harness.installPlugin(plugin);
    const route = getRoute(plugin, "/api/agent/chat", "POST");

    const response = await route?.handler(
      new Request("http://brain/api/agent/chat", {
        method: "POST",
        body: JSON.stringify({
          message: "Evaluate this",
          conversationId: "remote-conversation",
        }),
      }),
    );

    expect(response?.status).toBe(403);
    expect(await response?.text()).toBe("Forbidden");
  });

  it("runs authenticated Trusted web chat at exact Trusted permission", async () => {
    const agent = createSpyAgentService();
    harness.setAgentService(agent);
    const plugin = trustedAuthPlugin();
    await harness.installPlugin(plugin);
    const route = getRoute(plugin, "/api/chat", "POST");

    const response = await route?.handler(
      new Request("http://brain/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: "trusted-conversation",
          messages: [
            {
              role: "user",
              parts: [{ type: "text", text: "Show shared notes" }],
            },
          ],
        }),
      }),
    );

    expect(response?.status).toBe(200);
    expect(agent.chatCalls).toHaveLength(1);
    expect(agent.chatCalls[0]?.context).toEqual(
      expect.objectContaining({
        userPermissionLevel: "trusted",
        isAnchor: false,
        actor: expect.objectContaining({
          identity: {
            kind: "user",
            userId: "usr_collaborator",
            canonicalId: "user:collaborator",
          },
          displayName: "Collaborator",
        }),
      }),
    );
  });

  it("creates Trusted web-chat conversations with the server-derived person owner", async () => {
    const startCalls: Parameters<
      IConversationService["startConversation"]
    >[0][] = [];
    const conversations: Conversation[] = [];
    harness.getMockShell().setConversationService(
      makeFixedConversationService({
        conversations,
        messagesByConversation: {},
        startConversation: async (request): Promise<string> => {
          startCalls.push(request);
          conversations.push(
            makeConversation(request.sessionId, request.interfaceType, {
              personId: request.personId ?? null,
            }),
          );
          return request.sessionId;
        },
      }),
    );
    const agent = createSpyAgentService();
    harness.setAgentService(agent);
    const plugin = trustedAuthPlugin();
    await harness.installPlugin(plugin);
    const route = getRoute(plugin, "/api/chat", "POST");

    const response = await route?.handler(
      new Request("http://brain/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: "owned-conversation",
          messages: [
            {
              role: "user",
              parts: [{ type: "text", text: "Hello" }],
            },
          ],
        }),
      }),
    );

    expect(response?.status).toBe(200);
    expect(startCalls).toEqual([
      {
        sessionId: "owned-conversation",
        interfaceType: "web-chat",
        channelId: "owned-conversation",
        personId: "prsn_collaborator",
        metadata: {
          channelName: "Web Chat",
          interfaceType: "web-chat",
          channelId: "owned-conversation",
        },
      },
    ]);
  });

  it("fails closed when another person wins a conversation-creation race", async () => {
    const conversations: Conversation[] = [];
    harness.getMockShell().setConversationService(
      makeFixedConversationService({
        conversations,
        messagesByConversation: {},
        startConversation: async (request): Promise<string> => {
          conversations.push(
            makeConversation(request.sessionId, request.interfaceType, {
              personId: "prsn_other",
            }),
          );
          return request.sessionId;
        },
      }),
    );
    const agent = createSpyAgentService();
    harness.setAgentService(agent);
    const plugin = trustedAuthPlugin();
    await harness.installPlugin(plugin);

    const response = await requireRoute(plugin, "/api/chat", "POST").handler(
      new Request("http://brain/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: "raced-conversation",
          messages: [
            {
              role: "user",
              parts: [{ type: "text", text: "Hello" }],
            },
          ],
        }),
      }),
    );

    expect(response.status).toBe(404);
    expect(agent.chatCalls).toEqual([]);
  });

  it("returns 404 before sending a Trusted message to another person's conversation", async () => {
    harness.getMockShell().setConversationService(
      makeFixedConversationService({
        conversations: [
          makeConversation("foreign-conversation", "web-chat", {
            personId: "prsn_other",
          }),
        ],
        messagesByConversation: { "foreign-conversation": [] },
      }),
    );
    const agent = createSpyAgentService();
    harness.setAgentService(agent);
    const plugin = trustedAuthPlugin();
    await harness.installPlugin(plugin);
    const route = getRoute(plugin, "/api/chat", "POST");

    const response = await route?.handler(
      new Request("http://brain/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: "foreign-conversation",
          messages: [
            {
              role: "user",
              parts: [{ type: "text", text: "Show me the secret" }],
            },
          ],
        }),
      }),
    );

    expect(response?.status).toBe(404);
    expect(agent.chatCalls).toHaveLength(0);
  });

  it("denies suspended Trusted principals", async () => {
    const plugin = new WebChatInterface(
      {},
      {
        resolveAuthPrincipal: async (): Promise<AuthPrincipal> =>
          trustedPrincipal({ status: "suspended" }),
      },
    );
    await harness.installPlugin(plugin);
    const route = getRoute(plugin, "/api/chat", "POST");

    const response = await route?.handler(
      new Request("http://brain/api/chat", {
        method: "POST",
        body: "{}",
      }),
    );

    expect(response?.status).toBe(403);
    expect(await response?.text()).toBe("Forbidden");
  });

  it("denies active Public principals", async () => {
    const plugin = new WebChatInterface(
      {},
      {
        resolveAuthPrincipal: async (): Promise<AuthPrincipal> =>
          trustedPrincipal({ role: "public", permissionLevel: "public" }),
      },
    );
    await harness.installPlugin(plugin);
    const route = getRoute(plugin, "/api/chat", "POST");

    const response = await route?.handler(
      new Request("http://brain/api/chat", {
        method: "POST",
        body: "{}",
      }),
    );

    expect(response?.status).toBe(403);
    expect(await response?.text()).toBe("Forbidden");
  });

  it("resolves the default browser principal once per request", async () => {
    let resolutionCount = 0;
    const plugin = new WebChatInterface(
      {},
      {
        resolveAuthPrincipal: async (): Promise<undefined> => {
          resolutionCount += 1;
          return undefined;
        },
      },
    );
    await harness.installPlugin(plugin);
    const route = getRoute(plugin, "/api/chat", "POST");

    const response = await route?.handler(
      new Request("http://brain/api/chat", {
        method: "POST",
        body: "{}",
      }),
    );

    expect(response?.status).toBe(403);
    expect(resolutionCount).toBe(1);
  });

  it("returns 400 for malformed JSON on the chat endpoint", async () => {
    const plugin = adminPlugin();
    await harness.installPlugin(plugin);
    const route = getRoute(plugin, "/api/chat", "POST");

    const response = await route?.handler(
      new Request("http://brain/api/chat", {
        method: "POST",
        body: "{not json",
      }),
    );

    expect(response?.status).toBe(400);
    expect(await response?.text()).toBe("Invalid JSON body");
  });

  it("returns 400 for malformed JSON on the chat actions endpoint", async () => {
    const plugin = adminPlugin();
    await harness.installPlugin(plugin);
    const route = getRoute(plugin, "/api/chat/actions", "POST");

    const response = await route?.handler(
      new Request("http://brain/api/chat/actions", {
        method: "POST",
        body: "{not json",
      }),
    );

    expect(response?.status).toBe(400);
    expect(await response?.text()).toBe("Invalid JSON body");
  });

  it("forwards the action fromState through the runtime action channel", async () => {
    harness.getMockShell().setConversationService(
      makeFixedConversationService({
        conversations: [makeConversation("web-session", "web-chat")],
        messagesByConversation: { "web-session": [] },
      }),
    );
    const plugin = adminPlugin();
    const agent = createSpyAgentService();
    harness.setAgentService(agent);
    await harness.installPlugin(plugin);
    const received: unknown[] = [];
    harness.subscribe(AGENT_ACTION_REQUEST_CHANNEL, async (message) => {
      received.push(message.payload);
      return {
        success: true,
        data: {
          text: "Continuing onboarding.",
          usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
        },
      };
    });

    const route = getRoute(plugin, "/api/chat/actions", "POST");
    const response = await route?.handler(
      new Request("http://brain/api/chat/actions", {
        method: "POST",
        body: JSON.stringify({
          conversationId: "web-session",
          action: { type: "event", event: "NEXT", fromState: "welcome" },
        }),
      }),
    );

    expect(response?.status).toBe(200);
    expect(received).toEqual([
      {
        conversationId: "web-session",
        interfaceType: "web-chat",
        channelName: "Web Chat",
        userPermissionLevel: "admin",
        isAnchor: false,
        action: { type: "event", event: "NEXT", fromState: "welcome" },
      },
    ]);
  });

  it("requires authentication for the chat page", async () => {
    const plugin = new WebChatInterface();
    await harness.installPlugin(plugin);
    const route = getRoute(plugin, "/chat", "GET");

    const response = await route?.handler(new Request("http://brain/chat"));
    const text = await response?.text();

    expect(response?.status).toBe(401);
    expect(text).toContain("Authentication required");
  });

  it("serves the chat page for Trusted users", async () => {
    const plugin = trustedAuthPlugin();
    await harness.installPlugin(plugin);
    const route = getRoute(plugin, "/chat", "GET");

    const response = await route?.handler(new Request("http://brain/chat"));
    const html = await response?.text();

    expect(response?.status).toBe(200);
    expect(response?.headers.get("content-type")).toContain("text/html");
    expect(html).toContain("Brain Chat");
    expect(html).toContain("/chat/assets/app.js");
    expect(html).toContain("data-web-chat-styles");
    // The shared console sheet is the palette source; chat defines no
    // console-equivalent tokens and no fallback chains of its own.
    expect(html).toContain('[data-climate="instrument"]');
    expect(html).toContain('[data-climate="paper"]');
    expect(html).toContain('data-climate="instrument"');
    expect(html).not.toContain("data-theme");
    expect(html).not.toContain("var(--dashboard-");
    // The console strip: chat is the active surface; only registered
    // surfaces get doors (no dashboard or cms plugin in this harness).
    expect(html).toContain('class="console-strip"');
    expect(html).toContain("surface-nav-link is-active");
    expect(html).toContain(">Chat</a>");
    expect(html).not.toContain(">CMS<");
    expect(html).not.toContain(">Dashboard<");
    // Authenticated surface: the shared session chip shows signed-in state.
    expect(html).toContain('class="session-chip"');
    expect(html).toContain("Sign out");
    expect(html).toContain('href="/logout?return_to=%2Fchat"');
    // Climate preference is console-wide, toggled from the strip.
    expect(html).toContain('localStorage.getItem("console.climate")');
    expect(html).toContain('id="climateToggle"');
    expect(html).toContain('class="climate-chip"');
    // The ⌘K jump palette ships with the shell.
    expect(html).toContain("/api/console/jump");
    expect(html).toContain(".web-chat-session-dialog-backdrop");
    expect(html).toContain(
      ".web-chat-session-dialog-actions { flex-direction: column-reverse; }",
    );
    expect(html).toContain(".web-chat-session-rename,");
    expect(html).toContain(".web-chat-session-delete {");
    expect(html).toContain("opacity: 1;");
    expect(html).toContain("viewport-fit=cover");
    expect(html).toContain("min-height: 100dvh");
    expect(html).not.toMatch(/--chat-[a-z-]+\s*:/);
    expect(html).toContain(".web-chat-session-item { border-bottom:");
    expect(html).toContain(".web-chat-mobile-new");
    expect(html).toContain("clip-path: none");
  });

  it("does not reach out to fonts.googleapis.com from the chat page", async () => {
    const plugin = adminPlugin();
    await harness.installPlugin(plugin);
    const route = getRoute(plugin, "/chat", "GET");

    const response = await route?.handler(new Request("http://brain/chat"));
    const html = await response?.text();

    // The shared sheet may *name* the console font families (they resolve
    // locally or fall through to system stacks), but the page must never
    // load them from a third party.
    expect(html).not.toContain("fonts.googleapis.com");
    expect(html).not.toContain("fonts.gstatic.com");
    expect(html).not.toContain("<link");
  });

  it("registers no playbook bootstrap route", async () => {
    // Fresh conversations open on the empty state; playbooks start through
    // explicit commands instead.
    const plugin = adminPlugin();
    await harness.installPlugin(plugin);

    const bootstrap = plugin
      .getWebRoutes()
      .find((route) => route.path === "/api/chat/bootstrap");
    expect(bootstrap).toBeUndefined();
  });

  it("serves the React UI asset when built or a clear 404 otherwise", async () => {
    const plugin = new WebChatInterface();
    await harness.installPlugin(plugin);
    const route = getRoute(plugin, "/chat/assets/app.js", "GET");

    const response = await route?.handler(
      new Request("http://brain/chat/assets/app.js"),
    );
    const text = await response?.text();

    if (response?.status === 200) {
      expect(response.headers.get("content-type")).toContain("text/javascript");
      expect(text).toContain("data-web-chat-app");
    } else {
      expect(response?.status).toBe(404);
      expect(text).toContain("not built");
    }
  });

  it("rejects chat POSTs without an auth session", async () => {
    const agent = createSpyAgentService();
    harness.setAgentService(agent);
    const plugin = new WebChatInterface();
    await harness.installPlugin(plugin);
    const route = getRoute(plugin, "/api/chat", "POST");

    const response = await route?.handler(
      new Request("http://brain/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: "test-conversation",
          messages: [
            {
              role: "user",
              parts: [{ type: "text", text: "Hello web chat" }],
            },
          ],
        }),
      }),
    );

    expect(response?.status).toBe(403);
    expect(agent.chatCalls).toHaveLength(0);
  });

  it("streams approval cards as AI SDK native tool chunks", async () => {
    const agent = createSpyAgentService({
      text: "Confirmation required.",
      cards: [
        {
          kind: "tool-approval",
          id: "approval:call-1",
          toolCallId: "call-1",
          toolName: "delete_note",
          input: { noteId: "123" },
          summary: "Delete note?",
          state: "approval-requested",
        },
      ],
      pendingConfirmations: [
        {
          id: "approval:call-1",
          toolCallId: "call-1",
          toolName: "delete_note",
          summary: "Delete note?",
          args: { noteId: "123" },
        },
      ],
      usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
    });
    harness.setAgentService(agent);
    const plugin = adminPlugin();
    await harness.installPlugin(plugin);
    const route = getRoute(plugin, "/api/chat", "POST");

    const response = await route?.handler(
      new Request("http://brain/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: "test-conversation",
          messages: [
            {
              role: "user",
              parts: [{ type: "text", text: "Delete it" }],
            },
          ],
        }),
      }),
    );
    const body = await response?.text();

    expect(response?.status).toBe(200);
    expect(body).toContain("tool-input-available");
    expect(body).toContain("tool-approval-request");
    expect(body).toContain("approval:call-1");
    expect(body).not.toContain("data-approval-card");
  });

  it("streams progress notifications as structured data parts", async () => {
    const agent: IAgentService = {
      chat: async (_message, conversationId) => {
        await harness.sendMessage("job-progress", {
          id: "batch-1",
          type: "batch",
          status: "completed",
          message: "Finished indexing 24 files",
          metadata: {
            rootJobId: "batch-1",
            operationType: "batch_processing",
            operationTarget: "/tmp/brain-data",
            interfaceType: "web-chat",
            conversationId,
          },
        });
        return {
          text: "Batch finished.",
          usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
        };
      },
      confirmPendingAction: async () => ({
        text: "Action confirmed.",
        usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
      }),
      invalidateAgent: (): void => {},
    };
    harness.setAgentService(agent);
    const plugin = adminPlugin();
    await harness.installPlugin(plugin);
    const route = getRoute(plugin, "/api/chat", "POST");

    const response = await route?.handler(
      new Request("http://brain/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: "test-conversation",
          messages: [
            {
              role: "user",
              parts: [{ type: "text", text: "Run batch" }],
            },
          ],
        }),
      }),
    );
    const body = await response?.text();

    expect(response?.status).toBe(200);
    expect(body).toContain("data-progress");
    expect(body).toContain('"status":"completed"');
    expect(body).toContain('"operationType":"batch_processing"');
    expect(body).toContain('"operationTarget":"/tmp/brain-data"');
    expect(body).toContain("Finished indexing 24 files");
    expect(body).toContain('"transient":false');
    expect(body).not.toContain("✅");
    expect(body).not.toContain("**batch processing");
  });

  it("keeps pending progress transient and failed progress durable", async () => {
    const agent: IAgentService = {
      chat: async (_message, conversationId) => {
        await harness.sendMessage("job-progress", {
          id: "import-1",
          type: "job",
          status: "pending",
          message: "Queued upload import",
          metadata: {
            rootJobId: "import-1",
            operationType: "file_operations",
            operationTarget: "notes.pdf",
            interfaceType: "web-chat",
            conversationId,
          },
        });
        await harness.sendMessage("job-progress", {
          id: "import-1",
          type: "job",
          status: "failed",
          message: "Upload import failed",
          metadata: {
            rootJobId: "import-1",
            operationType: "file_operations",
            operationTarget: "notes.pdf",
            interfaceType: "web-chat",
            conversationId,
          },
        });
        return {
          text: "Import failed.",
          usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
        };
      },
      confirmPendingAction: async () => ({
        text: "Action confirmed.",
        usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
      }),
      invalidateAgent: (): void => {},
    };
    harness.setAgentService(agent);
    const plugin = adminPlugin();
    await harness.installPlugin(plugin);
    const route = getRoute(plugin, "/api/chat", "POST");

    const response = await route?.handler(
      new Request("http://brain/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: "test-conversation",
          messages: [
            {
              role: "user",
              parts: [{ type: "text", text: "Import upload" }],
            },
          ],
        }),
      }),
    );
    const body = await response?.text();

    expect(response?.status).toBe(200);
    expect(body).toContain('"status":"pending"');
    expect(body).toContain("Queued upload import");
    expect(body).toContain('"transient":true');
    expect(body).toContain('"status":"failed"');
    expect(body).toContain("Upload import failed");
    expect(body).toContain('"transient":false');
  });

  it("streams active tool activity as readable transient status parts", async () => {
    const agent: IAgentService = {
      chat: async (_message, conversationId) => {
        await harness.sendMessage("tool:invoking", {
          toolName: "playbook_start",
          conversationId,
          interfaceType: "web-chat",
          channelId: conversationId,
        });
        return {
          text: "Playbook started.",
          usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
        };
      },
      confirmPendingAction: async () => ({
        text: "Action confirmed.",
        usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
      }),
      invalidateAgent: (): void => {},
    };
    harness.setAgentService(agent);
    const plugin = adminPlugin();
    await harness.installPlugin(plugin);
    const route = getRoute(plugin, "/api/chat", "POST");

    const response = await route?.handler(
      new Request("http://brain/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: "test-conversation",
          messages: [
            {
              role: "user",
              parts: [{ type: "text", text: "Start onboarding" }],
            },
          ],
        }),
      }),
    );
    const body = await response?.text();

    expect(response?.status).toBe(200);
    expect(body).toContain("data-status");
    expect(body).toContain("tool-running");
    expect(body).toContain("Using playbook…");
    expect(body).not.toContain("Using playbook_start…");
  });

  it("streams awaiting approval when a completed tool returns a pending confirmation", async () => {
    const agent: IAgentService = {
      chat: async (_message, conversationId) => {
        await harness.sendMessage("tool:invoking", {
          toolName: "system_create",
          conversationId,
          interfaceType: "web-chat",
          channelId: conversationId,
        });
        await harness.sendMessage("tool:completed", {
          toolName: "system_create",
          conversationId,
          interfaceType: "web-chat",
          channelId: conversationId,
        });
        return {
          text: "Approval needed.",
          pendingConfirmations: [
            {
              id: "approval-1",
              toolName: "system_create",
              summary: "Create note",
              args: {},
            },
          ],
          usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
        };
      },
      confirmPendingAction: async () => ({
        text: "Action confirmed.",
        usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
      }),
      invalidateAgent: (): void => {},
    };
    harness.setAgentService(agent);
    const plugin = adminPlugin();
    await harness.installPlugin(plugin);
    const route = getRoute(plugin, "/api/chat", "POST");

    const response = await route?.handler(
      new Request("http://brain/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: "test-conversation",
          messages: [
            {
              role: "user",
              parts: [{ type: "text", text: "Create note" }],
            },
          ],
        }),
      }),
    );
    const body = await response?.text();

    expect(response?.status).toBe(200);
    expect(body).toContain("tool-running");
    expect(body).not.toContain("tool-completed");
    expect(body).toContain("tool-awaiting-approval");
    expect(body).toContain("Create is awaiting approval.");
  });

  it("ignores tool activity outside the active web-chat channel", async () => {
    const agent: IAgentService = {
      chat: async () => {
        await harness.sendMessage("tool:invoking", {
          toolName: "background_tool",
          conversationId: "other-conversation",
          interfaceType: "web-chat",
          channelId: "other-conversation",
        });
        return {
          text: "No visible tool status.",
          usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
        };
      },
      confirmPendingAction: async () => ({
        text: "Action confirmed.",
        usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
      }),
      invalidateAgent: (): void => {},
    };
    harness.setAgentService(agent);
    const plugin = adminPlugin();
    await harness.installPlugin(plugin);
    const route = getRoute(plugin, "/api/chat", "POST");

    const response = await route?.handler(
      new Request("http://brain/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: "test-conversation",
          messages: [
            {
              role: "user",
              parts: [{ type: "text", text: "Search notes" }],
            },
          ],
        }),
      }),
    );
    const body = await response?.text();

    expect(response?.status).toBe(200);
    expect(body).not.toContain("background_tool");
    expect(body).not.toContain("tool-running");
  });

  it("ignores progress notifications outside the active web-chat conversation", async () => {
    const agent: IAgentService = {
      chat: async () => {
        await harness.sendMessage("job-progress", {
          id: "batch-2",
          type: "batch",
          status: "completed",
          metadata: {
            rootJobId: "batch-2",
            operationType: "batch_processing",
            operationTarget: "/tmp/background",
            interfaceType: "web-chat",
            conversationId: "other-conversation",
          },
        });
        return {
          text: "No visible progress.",
          usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
        };
      },
      confirmPendingAction: async () => ({
        text: "Action confirmed.",
        usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
      }),
      invalidateAgent: (): void => {},
    };
    harness.setAgentService(agent);
    const plugin = adminPlugin();
    await harness.installPlugin(plugin);
    const route = getRoute(plugin, "/api/chat", "POST");

    const response = await route?.handler(
      new Request("http://brain/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: "test-conversation",
          messages: [
            {
              role: "user",
              parts: [{ type: "text", text: "Run batch" }],
            },
          ],
        }),
      }),
    );
    const body = await response?.text();

    expect(response?.status).toBe(200);
    expect(body).not.toContain("data-progress");
    expect(body).not.toContain("/tmp/background");
  });

  it("does not infer artifact cards from assistant text without structured cards", async () => {
    const agent = createSpyAgentService({
      text: "Started generating image wild-robot.",
      toolResults: [
        {
          toolName: "system_create",
          jobId: "job-1",
          data: {
            success: true,
            entityId: "wild-robot",
            status: "generating",
          },
        },
      ],
      usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
    });
    harness.setAgentService(agent);
    const plugin = adminPlugin();
    await harness.installPlugin(plugin);
    const route = getRoute(plugin, "/api/chat", "POST");

    const response = await route?.handler(
      new Request("http://brain/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: "test-conversation",
          messages: [
            {
              role: "user",
              parts: [{ type: "text", text: "Generate a wild robot" }],
            },
          ],
        }),
      }),
    );
    const body = await response?.text();

    expect(response?.status).toBe(200);
    expect(body).toContain("Started generating image wild-robot.");
    expect(body).toContain("data-tool-result");
    expect(body).not.toContain("data-attachment");
    expect(body).not.toContain("/api/chat/attachments/image");
  });

  it("redacts raw upload refs from streamed tool result details and approval input", async () => {
    const uploadId = "upload-00000000-0000-4000-8000-000000000888";
    const uploadArg = { kind: "upload", id: uploadId };
    const agent = createSpyAgentService({
      text: "Confirmation required.",
      toolResults: [
        {
          toolName: "system_create",
          args: {
            entityType: "document",
            upload: uploadArg,
          },
        },
      ],
      cards: [
        {
          kind: "tool-approval",
          id: "approval:call-1",
          toolCallId: "call-1",
          toolName: "system_create",
          input: {
            entityType: "document",
            upload: uploadArg,
          },
          summary: "Create document?",
          preview: "Entity type: document\nUpload: uploaded file",
          state: "approval-requested",
        },
      ],
      usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
    });
    harness.setAgentService(agent);
    const plugin = adminPlugin();
    await harness.installPlugin(plugin);
    const route = getRoute(plugin, "/api/chat", "POST");

    const response = await route?.handler(
      new Request("http://brain/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: "test-conversation",
          messages: [
            {
              role: "user",
              parts: [{ type: "text", text: "Save the upload" }],
            },
          ],
        }),
      }),
    );
    const body = await response?.text();

    expect(response?.status).toBe(200);
    expect(body).toContain("data-tool-result");
    expect(body).toContain("uploaded file");
    expect(body).not.toContain(uploadId);
  });

  it("streams source citation cards as Brain data parts", async () => {
    const agent = createSpyAgentService({
      text: "According to retrieved context...",
      cards: [
        {
          kind: "sources",
          id: "sources:agent-context",
          title: "Retrieved context",
          sources: [
            {
              id: "summary-1",
              title: "Relay decision summary",
              source: "conversation-memory",
              entityType: "summary",
              entityId: "summary-1",
              excerpt: "The team decided to use explicit memory retrieval.",
            },
          ],
        },
      ],
      usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
    });
    harness.setAgentService(agent);
    const plugin = adminPlugin();
    await harness.installPlugin(plugin);
    const route = getRoute(plugin, "/api/chat", "POST");

    const response = await route?.handler(
      new Request("http://brain/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: "test-conversation",
          messages: [
            {
              role: "user",
              parts: [{ type: "text", text: "What did we decide?" }],
            },
          ],
        }),
      }),
    );
    const body = await response?.text();

    expect(response?.status).toBe(200);
    expect(body).toContain("data-sources");
    expect(body).toContain("Retrieved context");
    expect(body).toContain("summary-1");
  });

  it("streams action cards as Brain data parts", async () => {
    const agent = createSpyAgentService({
      text: "Choose the next step.",
      cards: [
        {
          kind: "actions",
          id: "actions:onboarding",
          title: "Next steps",
          actions: [
            {
              type: "prompt",
              id: "review-draft",
              label: "Review draft",
              prompt: "Show me the transformed draft.",
            },
          ],
        },
      ],
      usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
    });
    harness.setAgentService(agent);
    const plugin = adminPlugin();
    await harness.installPlugin(plugin);
    const route = getRoute(plugin, "/api/chat", "POST");

    const response = await route?.handler(
      new Request("http://brain/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: "test-conversation",
          messages: [
            {
              role: "user",
              parts: [{ type: "text", text: "What next?" }],
            },
          ],
        }),
      }),
    );
    const body = await response?.text();

    expect(response?.status).toBe(200);
    expect(body).toContain("data-actions");
    expect(body).toContain("Next steps");
    expect(body).toContain("review-draft");
  });

  it("streams attachment cards as Brain data parts", async () => {
    const agent = createSpyAgentService({
      text: "Export ready.",
      cards: [
        {
          kind: "attachment",
          id: "attachment:report-1",
          title: "Weekly export",
          description: "PDF export generated by the publish tool.",
          attachment: {
            mediaType: "application/pdf",
            url: "/media/documents/report-1",
            downloadUrl: "/media/documents/report-1?download=1",
            filename: "weekly-export.pdf",
            sizeBytes: 42_000,
            source: {
              entityType: "document",
              entityId: "report-1",
              attachmentType: "export",
            },
          },
        },
      ],
      usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
    });
    harness.setAgentService(agent);
    const plugin = adminPlugin();
    await harness.installPlugin(plugin);
    const route = getRoute(plugin, "/api/chat", "POST");

    const response = await route?.handler(
      new Request("http://brain/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: "test-conversation",
          messages: [
            {
              role: "user",
              parts: [{ type: "text", text: "Export this" }],
            },
          ],
        }),
      }),
    );
    const body = await response?.text();

    expect(response?.status).toBe(200);
    expect(body).toContain("data-attachment");
    expect(body).toContain("attachment:report-1");
    expect(body).toContain("Weekly export");
    expect(body).toContain("/media/documents/report-1");
    expect(body).not.toContain("tool-input-available");
  });

  it("serves generated PDF document attachments to Admins", async () => {
    const plugin = adminPlugin();
    harness.addEntities([
      {
        id: "deck-carousel",
        entityType: "document",
        content: "data:application/pdf;base64,JVBERi0xLjc=",
        metadata: {
          filename: "deck-carousel.pdf",
          mimeType: "application/pdf",
        },
      },
    ]);
    await harness.installPlugin(plugin);
    const route = getRoute(plugin, "/api/chat/attachments/document", "GET");

    const response = await route?.handler(
      new Request(
        "http://brain/api/chat/attachments/document?id=deck-carousel&download=1",
      ),
    );
    const body = await response?.arrayBuffer();

    expect(response?.status).toBe(200);
    expect(response?.headers.get("content-type")).toBe("application/pdf");
    expect(response?.headers.get("content-disposition")).toBe(
      "attachment; filename=\"deck-carousel.pdf\"; filename*=UTF-8''deck-carousel.pdf",
    );
    expect(Buffer.from(body ?? new ArrayBuffer(0)).toString("utf8")).toBe(
      "%PDF-1.7",
    );
  });

  it("does not serve restricted document attachments to trusted callers", async () => {
    const plugin = trustedPlugin();
    harness.addEntities([
      {
        id: "restricted-deck",
        entityType: "document",
        content: "data:application/pdf;base64,JVBERi0xLjc=",
        metadata: { filename: "restricted-deck.pdf" },
        visibility: "restricted",
      },
    ]);
    await harness.installPlugin(plugin);
    const route = getRoute(plugin, "/api/chat/attachments/document", "GET");

    const response = await route?.handler(
      new Request(
        "http://brain/api/chat/attachments/document?id=restricted-deck&download=1",
      ),
    );

    expect(response?.status).toBe(404);
    expect(await response?.text()).toBe("Document not found");
  });

  it("serves generated image attachments to Admins", async () => {
    const plugin = adminPlugin();
    harness.addEntities([
      {
        id: "mossy-robot",
        entityType: "image",
        content: "data:image/png;base64,iVBORw0KGgo=",
        metadata: {
          title: "Mossy robot",
          alt: "Mossy robot",
          format: "png",
          width: 1,
          height: 1,
        },
      },
    ]);
    await harness.installPlugin(plugin);
    const route = getRoute(plugin, "/api/chat/attachments/image", "GET");

    const response = await route?.handler(
      new Request(
        "http://brain/api/chat/attachments/image?id=mossy-robot&download=1",
      ),
    );
    const body = await response?.arrayBuffer();

    expect(response?.status).toBe(200);
    expect(response?.headers.get("content-type")).toBe("image/png");
    expect(response?.headers.get("content-disposition")).toBe(
      "attachment; filename=\"mossy-robot.png\"; filename*=UTF-8''mossy-robot.png",
    );
    expect(Buffer.from(body ?? new ArrayBuffer(0)).toString("base64")).toBe(
      "iVBORw0KGgo=",
    );
  });

  it("rejects image attachment requests from unauthenticated callers", async () => {
    const plugin = new WebChatInterface();
    await harness.installPlugin(plugin);
    const route = getRoute(plugin, "/api/chat/attachments/image", "GET");

    const response = await route?.handler(
      new Request("http://brain/api/chat/attachments/image?id=mossy-robot"),
    );

    expect(response?.status).toBe(401);
  });

  it("rejects document attachment requests from unauthenticated callers", async () => {
    const plugin = new WebChatInterface();
    await harness.installPlugin(plugin);
    const route = getRoute(plugin, "/api/chat/attachments/document", "GET");

    const response = await route?.handler(
      new Request(
        "http://brain/api/chat/attachments/document?id=deck-carousel",
      ),
    );

    expect(response?.status).toBe(401);
  });

  it("reports queued artifact job status to Trusted users", async () => {
    const plugin = trustedAuthPlugin();
    const shell = harness.getMockShell();
    shell.jobs.getStatus = async (jobId: string): Promise<JobStatus> =>
      makeJobStatus(jobId, "processing");
    await harness.installPlugin(plugin);
    const route = getRoute(plugin, "/api/chat/jobs/status", "GET");

    const response = await route?.handler(
      new Request("http://brain/api/chat/jobs/status?id=job-1"),
    );
    const body = await response?.json();

    expect(response?.status).toBe(200);
    expect(body).toEqual({ id: "job-1", status: "processing" });
  });

  it("rejects artifact job status requests from unauthenticated callers", async () => {
    const plugin = new WebChatInterface();
    await harness.installPlugin(plugin);
    const route = getRoute(plugin, "/api/chat/jobs/status", "GET");

    const response = await route?.handler(
      new Request("http://brain/api/chat/jobs/status?id=job-1"),
    );

    expect(response?.status).toBe(401);
  });

  it("accepts Trusted multipart text uploads and returns a durable upload ref", async () => {
    const plugin = trustedAuthPlugin();
    await harness.installPlugin(plugin);
    const route = getRoute(plugin, "/api/chat/uploads", "POST");
    const form = new FormData();
    form.set(
      "file",
      new File(["# Notes\n\nShip durable uploads"], "../notes.md", {
        type: "text/markdown",
      }),
    );

    const response = await route?.handler(
      new Request("http://brain/api/chat/uploads", {
        method: "POST",
        body: form,
      }),
    );
    const body = (await response?.json()) as {
      id: string;
      ref: { kind: string; id: string };
      filename: string;
      mediaType: string;
      sizeBytes: number;
      createdAt: string;
      url: string;
      downloadUrl: string;
    };

    expect(response?.status).toBe(201);
    expect(body.id).toStartWith("upload-");
    expect(body.ref).toEqual({ kind: "upload", id: body.id });
    expect(body.filename).toBe("notes.md");
    expect(body.mediaType).toBe("text/markdown");
    expect(body.sizeBytes).toBe(29);
    expect(Date.parse(body.createdAt)).not.toBeNaN();
    expect(body.url).toBe(`/api/chat/uploads?id=${body.id}`);
    expect(body.downloadUrl).toBe(`/api/chat/uploads?id=${body.id}&download=1`);

    const uploadDir = join(
      "/tmp/mock-shell-test-data",
      "upload",
      "uploads",
      body.id,
    );
    expect(await Bun.file(join(uploadDir, "content")).text()).toBe(
      "# Notes\n\nShip durable uploads",
    );
    expect(await Bun.file(join(uploadDir, "metadata.json")).json()).toEqual({
      id: body.id,
      ref: body.ref,
      filename: body.filename,
      mediaType: body.mediaType,
      sizeBytes: body.sizeBytes,
      createdAt: body.createdAt,
    });
  });

  it("stores multipart uploads in runtime data, not content brain-data", async () => {
    const root = "/tmp/web-chat-file-upload-path-test";
    await rm(root, { recursive: true, force: true });
    const scopedHarness = createPluginHarness<WebChatInterface>({
      dataDir: join(root, "brain-data"),
    });
    const plugin = new WebChatInterface(
      {},
      { resolveAuthSession: async (): Promise<boolean> => true },
    );
    await scopedHarness.installPlugin(plugin);
    const route = getRoute(plugin, "/api/chat/uploads", "POST");
    const form = new FormData();
    form.set(
      "file",
      new File(["# Runtime"], "runtime.md", { type: "text/markdown" }),
    );

    const response = await route?.handler(
      new Request("http://brain/api/chat/uploads", {
        method: "POST",
        body: form,
      }),
    );
    const body = (await response?.json()) as { id: string };

    expect(response?.status).toBe(201);
    expect(
      await Bun.file(
        join(root, "data", "upload", "uploads", body.id, "content"),
      ).text(),
    ).toBe("# Runtime");
    expect(
      await Bun.file(
        join(root, "brain-data", "upload", "uploads", body.id, "content"),
      ).exists(),
    ).toBe(false);

    scopedHarness.reset();
    await rm(root, { recursive: true, force: true });
  });

  it("serves stored multipart text uploads to Admins", async () => {
    const plugin = adminPlugin();
    await harness.installPlugin(plugin);
    const route = getRoute(plugin, "/api/chat/uploads", "POST");
    const downloadRoute = getRoute(plugin, "/api/chat/uploads", "GET");
    const form = new FormData();
    form.set(
      "file",
      new File(["# Downloadable"], "notes.md", { type: "text/markdown" }),
    );
    const uploadResponse = await route?.handler(
      new Request("http://brain/api/chat/uploads", {
        method: "POST",
        body: form,
      }),
    );
    const upload = (await uploadResponse?.json()) as {
      id: string;
      url: string;
    };

    const response = await downloadRoute?.handler(
      new Request(`http://brain${upload.url}`),
    );

    expect(response?.status).toBe(200);
    expect(response?.headers.get("Content-Type")).toBe("text/markdown");
    expect(response?.headers.get("Content-Disposition")).toBe(
      "inline; filename=\"notes.md\"; filename*=UTF-8''notes.md",
    );
    expect(await response?.text()).toBe("# Downloadable");
  });

  it("accepts and serves multipart image uploads to Admins", async () => {
    const plugin = adminPlugin();
    await harness.installPlugin(plugin);
    const route = getRoute(plugin, "/api/chat/uploads", "POST");
    const downloadRoute = getRoute(plugin, "/api/chat/uploads", "GET");
    const image = pngBytes();
    const form = new FormData();
    form.set("file", new File([image], "robot.png", { type: "image/png" }));

    const uploadResponse = await route?.handler(
      new Request("http://brain/api/chat/uploads", {
        method: "POST",
        body: form,
      }),
    );
    const upload = (await uploadResponse?.json()) as {
      filename: string;
      mediaType: string;
      sizeBytes: number;
      url: string;
    };

    expect(uploadResponse?.status).toBe(201);
    expect(upload).toEqual(
      expect.objectContaining({
        filename: "robot.png",
        mediaType: "image/png",
        sizeBytes: image.byteLength,
      }),
    );

    const response = await downloadRoute?.handler(
      new Request(`http://brain${upload.url}`),
    );

    expect(response?.status).toBe(200);
    expect(response?.headers.get("Content-Type")).toBe("image/png");
    expect(response?.headers.get("Content-Disposition")).toBe(
      "inline; filename=\"robot.png\"; filename*=UTF-8''robot.png",
    );
    if (!response) throw new Error("Missing download response");
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(image);
  });

  it("rejects stored upload downloads from unauthenticated callers", async () => {
    const plugin = new WebChatInterface();
    await harness.installPlugin(plugin);
    const route = getRoute(plugin, "/api/chat/uploads", "GET");

    const response = await route?.handler(
      new Request(
        "http://brain/api/chat/uploads?id=upload-00000000-0000-4000-8000-000000000000",
      ),
    );

    expect(response?.status).toBe(403);
  });

  it("rejects multipart uploads from unauthenticated callers", async () => {
    const plugin = new WebChatInterface();
    await harness.installPlugin(plugin);
    const route = getRoute(plugin, "/api/chat/uploads", "POST");
    const form = new FormData();
    form.set("file", new File(["hello"], "notes.txt", { type: "text/plain" }));

    const response = await route?.handler(
      new Request("http://brain/api/chat/uploads", {
        method: "POST",
        body: form,
      }),
    );

    expect(response?.status).toBe(403);
  });

  it("rejects unsupported multipart upload types", async () => {
    const plugin = adminPlugin();
    await harness.installPlugin(plugin);
    const route = getRoute(plugin, "/api/chat/uploads", "POST");
    const form = new FormData();
    form.set(
      "file",
      new File(["not text"], "image.png", { type: "image/png" }),
    );

    const response = await route?.handler(
      new Request("http://brain/api/chat/uploads", {
        method: "POST",
        body: form,
      }),
    );

    expect(response?.status).toBe(400);
    expect(await response?.text()).toContain("Unsupported file upload type");
  });

  it("rejects oversized multipart text uploads", async () => {
    const plugin = adminPlugin();
    await harness.installPlugin(plugin);
    const route = getRoute(plugin, "/api/chat/uploads", "POST");
    const form = new FormData();
    form.set(
      "file",
      new File(["x".repeat(100_001)], "large.txt", { type: "text/plain" }),
    );

    const response = await route?.handler(
      new Request("http://brain/api/chat/uploads", {
        method: "POST",
        body: form,
      }),
    );

    expect(response?.status).toBe(400);
    expect(await response?.text()).toContain("File upload too large");
  });

  it("rejects oversized uploads via Content-Length before buffering", async () => {
    const plugin = adminPlugin();
    await harness.installPlugin(plugin);
    const route = getRoute(plugin, "/api/chat/uploads", "POST");
    const form = new FormData();
    form.set("file", new File(["small"], "notes.txt", { type: "text/plain" }));

    const response = await route?.handler(
      new Request("http://brain/api/chat/uploads", {
        method: "POST",
        // Declared length far exceeds the upload limit + envelope slack, so the
        // guard rejects before the multipart body is buffered. No filename is
        // known yet, so the message carries no filename suffix.
        headers: { "content-length": "6000000" },
        body: form,
      }),
    );

    expect(response?.status).toBe(400);
    expect(await response?.text()).toBe("File upload too large");
  });

  it("rejects binary content uploaded under a text filename", async () => {
    const plugin = adminPlugin();
    await harness.installPlugin(plugin);
    const route = getRoute(plugin, "/api/chat/uploads", "POST");
    const form = new FormData();
    form.set(
      "file",
      new File([new Uint8Array([0x68, 0x69, 0x00, 0xff])], "notes.txt", {
        type: "text/plain",
      }),
    );

    const response = await route?.handler(
      new Request("http://brain/api/chat/uploads", {
        method: "POST",
        body: form,
      }),
    );

    expect(response?.status).toBe(400);
    expect(await response?.text()).toContain("Unsupported file upload type");
  });

  it("prunes stale stored uploads when a new upload arrives", async () => {
    const plugin = adminPlugin();
    await harness.installPlugin(plugin);
    const route = getRoute(plugin, "/api/chat/uploads", "POST");

    const uploadsRoot = join("/tmp/mock-shell-test-data", "upload", "uploads");
    // Seed a stale upload dir (>24h old) that should be swept.
    const staleDir = join(
      uploadsRoot,
      "upload-00000000-0000-4000-8000-000000000000",
    );
    await mkdir(staleDir, { recursive: true });
    await writeFile(join(staleDir, "content"), "old");
    const staleAge = new Date(Date.now() - 48 * 60 * 60 * 1000);
    await utimes(staleDir, staleAge, staleAge);

    const form = new FormData();
    form.set(
      "file",
      new File(["# Fresh"], "fresh.md", { type: "text/markdown" }),
    );
    const response = await route?.handler(
      new Request("http://brain/api/chat/uploads", {
        method: "POST",
        body: form,
      }),
    );
    const body = (await response?.json()) as { id: string };

    expect(response?.status).toBe(201);
    // Stale dir removed, fresh upload retained.
    expect(await Bun.file(join(staleDir, "content")).exists()).toBe(false);
    expect(await Bun.file(join(uploadsRoot, body.id, "content")).exists()).toBe(
      true,
    );
  });

  it("passes durable upload refs to the agent as native text attachments", async () => {
    const agent = createSpyAgentService();
    harness.setAgentService(agent);
    const plugin = adminPlugin();
    await harness.installPlugin(plugin);
    const uploadRoute = getRoute(plugin, "/api/chat/uploads", "POST");
    const chatRoute = getRoute(plugin, "/api/chat", "POST");
    const form = new FormData();
    form.set(
      "file",
      new File(["# Durable Notes"], "durable-notes.md", {
        type: "text/markdown",
      }),
    );
    const uploadResponse = await uploadRoute?.handler(
      new Request("http://brain/api/chat/uploads", {
        method: "POST",
        body: form,
      }),
    );
    const upload = (await uploadResponse?.json()) as {
      ref: { kind: string; id: string };
    };

    const response = await chatRoute?.handler(
      new Request("http://brain/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: "test-conversation",
          messages: [
            {
              role: "user",
              content: "Summarize this",
              parts: [{ type: "data-upload", data: { ref: upload.ref } }],
            },
          ],
        }),
      }),
    );

    expect(response?.status).toBe(200);
    expect(agent.chatCalls[0]?.message).toBe("Summarize this");
    expect(agent.chatCalls[0]?.context?.attachments).toEqual([
      {
        kind: "text",
        filename: "durable-notes.md",
        mediaType: "text/markdown",
        content: "# Durable Notes",
        sizeBytes: 15,
        source: { kind: "upload", id: upload.ref.id },
      },
    ]);
  });

  it("passes durable image upload refs to the agent as native file attachments", async () => {
    const agent = createSpyAgentService();
    harness.setAgentService(agent);
    const plugin = adminPlugin();
    await harness.installPlugin(plugin);
    const uploadRoute = getRoute(plugin, "/api/chat/uploads", "POST");
    const chatRoute = getRoute(plugin, "/api/chat", "POST");
    const image = pngBytes();
    const form = new FormData();
    form.set("file", new File([image], "robot.png", { type: "image/png" }));
    const uploadResponse = await uploadRoute?.handler(
      new Request("http://brain/api/chat/uploads", {
        method: "POST",
        body: form,
      }),
    );
    const upload = (await uploadResponse?.json()) as {
      ref: { kind: string; id: string };
    };

    const response = await chatRoute?.handler(
      new Request("http://brain/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: "test-conversation",
          messages: [
            {
              role: "user",
              content: "Describe this image",
              parts: [{ type: "data-upload", data: { ref: upload.ref } }],
            },
          ],
        }),
      }),
    );

    expect(response?.status).toBe(200);
    expect(agent.chatCalls[0]?.message).toBe("Describe this image");
    expect(agent.chatCalls[0]?.context?.attachments).toEqual([
      {
        kind: "file",
        filename: "robot.png",
        mediaType: "image/png",
        data: image,
        sizeBytes: image.byteLength,
        source: { kind: "upload", id: upload.ref.id },
      },
    ]);
  });

  it("rejects invalid durable upload refs", async () => {
    const agent = createSpyAgentService();
    harness.setAgentService(agent);
    const plugin = adminPlugin();
    await harness.installPlugin(plugin);
    const route = getRoute(plugin, "/api/chat", "POST");

    const response = await route?.handler(
      new Request("http://brain/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: "test-conversation",
          messages: [
            {
              role: "user",
              parts: [
                {
                  type: "data-upload",
                  data: { ref: { kind: "upload", id: "../bad" } },
                },
              ],
            },
          ],
        }),
      }),
    );

    expect(response?.status).toBe(400);
    expect(await response?.text()).toContain("Invalid upload ref");
    expect(agent.chatCalls).toHaveLength(0);
  });

  it("terminally resolves an expired AI SDK approval card", async () => {
    const persistedMessages: Parameters<
      IConversationService["addMessage"]
    >[0][] = [];
    const shell = harness.getMockShell();
    shell.setConversationService(
      makeFixedConversationService({
        conversations: [makeConversation("test-conversation", "web-chat")],
        messagesByConversation: {},
        addMessage: async (message): Promise<void> => {
          persistedMessages.push(message);
        },
      }),
    );
    const agent = createSpyAgentService(undefined, {
      text: "No pending action to confirm.",
      usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
    });
    harness.setAgentService(agent);
    const plugin = adminPlugin();
    await harness.installPlugin(plugin);
    const route = getRoute(plugin, "/api/chat", "POST");

    const response = await route?.handler(
      new Request("http://brain/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: "test-conversation",
          messages: [
            {
              id: "assistant-message-1",
              role: "assistant",
              parts: [
                {
                  type: "dynamic-tool",
                  toolCallId: "expired-call",
                  toolName: "delete_note",
                  state: "approval-responded",
                  title: "Delete note?",
                  input: { noteId: "123" },
                  approval: {
                    id: "approval:expired-call",
                    approved: true,
                  },
                },
              ],
            },
          ],
        }),
      }),
    );
    const body = await response?.text();

    expect(response?.status).toBe(200);
    expect(agent.confirmCalls).toHaveLength(1);
    expect(body).toContain("tool-output-error");
    expect(body).toContain("expired-call");
    expect(persistedMessages).toContainEqual(
      expect.objectContaining({
        conversationId: "test-conversation",
        role: "assistant",
        metadata: expect.objectContaining({
          cards: [
            expect.objectContaining({
              kind: "tool-approval",
              id: "approval:expired-call",
              toolCallId: "expired-call",
              toolName: "delete_note",
              summary: "Delete note?",
              state: "output-error",
            }),
          ],
        }),
      }),
    );
  });

  it("handles Trusted AI SDK approval responses at exact Trusted permission", async () => {
    const agent = createSpyAgentService(undefined, {
      text: "Completed: Delete note?",
      cards: [
        {
          kind: "tool-approval",
          id: "approval:call-1",
          toolCallId: "call-1",
          toolName: "delete_note",
          input: { noteId: "123" },
          summary: "Delete note?",
          state: "output-available",
          output: { success: true },
        },
      ],
      usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
    });
    harness.setAgentService(agent);
    const plugin = trustedAuthPlugin();
    await harness.installPlugin(plugin);
    const route = getRoute(plugin, "/api/chat", "POST");

    const response = await route?.handler(
      new Request("http://brain/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: "test-conversation",
          trigger: "submit-message",
          messages: [
            {
              id: "assistant-message-1",
              role: "assistant",
              parts: [
                {
                  type: "dynamic-tool",
                  toolCallId: "call-1",
                  toolName: "delete_note",
                  state: "approval-responded",
                  input: { noteId: "123" },
                  approval: {
                    id: "approval:call-1",
                    approved: true,
                  },
                },
              ],
            },
          ],
        }),
      }),
    );
    const body = await response?.text();

    expect(response?.status).toBe(200);
    expect(agent.chatCalls).toHaveLength(0);
    expect(agent.confirmCalls).toEqual([
      expect.objectContaining({
        conversationId: "test-conversation",
        confirmed: true,
        approvalId: "approval:call-1",
        context: expect.objectContaining({
          userPermissionLevel: "trusted",
          interfaceType: "web-chat",
          channelId: "test-conversation",
          channelName: "Web Chat",
          actor: expect.objectContaining({
            identity: {
              kind: "user",
              userId: "usr_collaborator",
              canonicalId: "user:collaborator",
            },
            interfaceType: "web-chat",
            role: "user",
          }),
          source: expect.objectContaining({
            channelId: "test-conversation",
            channelName: "Web Chat",
            metadata: expect.objectContaining({ trigger: "approval-response" }),
          }),
        }),
      }),
    ]);
    expect(body).toContain("tool-output-available");
    expect(body).toContain("call-1");
  });

  it("handles approval responses when full message history includes prior user input", async () => {
    const agent = createSpyAgentService(undefined, {
      text: "Completed: Delete note?",
      cards: [
        {
          kind: "tool-approval",
          id: "approval:call-1",
          toolCallId: "call-1",
          toolName: "delete_note",
          input: { noteId: "123" },
          summary: "Delete note?",
          state: "output-available",
          output: { success: true },
        },
      ],
      usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
    });
    harness.setAgentService(agent);
    const plugin = adminPlugin();
    await harness.installPlugin(plugin);
    const route = getRoute(plugin, "/api/chat", "POST");

    const response = await route?.handler(
      new Request("http://brain/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: "test-conversation",
          messages: [
            {
              id: "user-message-1",
              role: "user",
              parts: [{ type: "text", text: "Delete it" }],
            },
            {
              id: "assistant-message-1",
              role: "assistant",
              parts: [
                { type: "text", text: "Confirmation required." },
                {
                  type: "dynamic-tool",
                  toolCallId: "call-1",
                  toolName: "delete_note",
                  state: "approval-responded",
                  input: { noteId: "123" },
                  approval: {
                    id: "approval:call-1",
                    approved: true,
                  },
                },
              ],
            },
          ],
        }),
      }),
    );
    const body = await response?.text();

    expect(response?.status).toBe(200);
    expect(agent.chatCalls).toHaveLength(0);
    expect(agent.confirmCalls).toEqual([
      expect.objectContaining({
        conversationId: "test-conversation",
        confirmed: true,
        approvalId: "approval:call-1",
        context: expect.objectContaining({ interfaceType: "web-chat" }),
      }),
    ]);
    expect(body).toContain("tool-output-available");
    expect(body).toContain("call-1");
  });

  it("handles multiple AI SDK approval responses through one chat request", async () => {
    const agent = createSpyAgentService(undefined, {
      text: "Completed approval.",
      cards: [
        {
          kind: "tool-approval",
          id: "approval:call-1",
          toolCallId: "call-1",
          toolName: "delete_note",
          input: { noteId: "123" },
          summary: "Delete note?",
          state: "output-available",
          output: { success: true },
        },
      ],
      usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
    });
    harness.setAgentService(agent);
    const plugin = adminPlugin();
    await harness.installPlugin(plugin);
    const route = getRoute(plugin, "/api/chat", "POST");

    const response = await route?.handler(
      new Request("http://brain/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: "test-conversation",
          messages: [
            {
              id: "assistant-message-1",
              role: "assistant",
              parts: [
                {
                  type: "dynamic-tool",
                  toolCallId: "call-1",
                  toolName: "delete_note",
                  state: "approval-responded",
                  approval: { id: "approval:call-1", approved: true },
                },
                {
                  type: "dynamic-tool",
                  toolCallId: "call-2",
                  toolName: "delete_note",
                  state: "approval-responded",
                  approval: { id: "approval:call-2", approved: false },
                },
              ],
            },
          ],
        }),
      }),
    );

    const body = await response?.text();

    expect(response?.status).toBe(200);
    expect(agent.chatCalls).toHaveLength(0);
    expect(agent.confirmCalls).toEqual([
      expect.objectContaining({
        conversationId: "test-conversation",
        confirmed: true,
        approvalId: "approval:call-1",
        context: expect.objectContaining({ interfaceType: "web-chat" }),
      }),
      expect.objectContaining({
        conversationId: "test-conversation",
        confirmed: false,
        approvalId: "approval:call-2",
        context: expect.objectContaining({ interfaceType: "web-chat" }),
      }),
    ]);
    expect(body).toContain("tool-output-available");
  });

  it("routes new user messages instead of replaying old approval responses", async () => {
    const agent = createSpyAgentService();
    harness.setAgentService(agent);
    const plugin = adminPlugin();
    await harness.installPlugin(plugin);
    const route = getRoute(plugin, "/api/chat", "POST");

    const response = await route?.handler(
      new Request("http://brain/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: "test-conversation",
          messages: [
            {
              id: "assistant-message-1",
              role: "assistant",
              parts: [
                {
                  type: "dynamic-tool",
                  toolCallId: "call-1",
                  toolName: "delete_note",
                  state: "approval-responded",
                  approval: { id: "approval:call-1", approved: true },
                },
              ],
            },
            {
              id: "user-message-2",
              role: "user",
              parts: [{ type: "text", text: "What happened next?" }],
            },
          ],
        }),
      }),
    );

    expect(response?.status).toBe(200);
    expect(agent.confirmCalls).toHaveLength(0);
    expect(agent.chatCalls).toEqual([
      {
        message: "What happened next?",
        conversationId: "test-conversation",
        context: expect.objectContaining({
          interfaceType: "web-chat",
          channelId: "test-conversation",
          channelName: "Web Chat",
          actor: expect.objectContaining({
            identity: {
              kind: "external",
              externalActorId: createExternalActorId(
                "web-chat",
                "web-chat:test-conversation:browser-user",
              ),
            },
            interfaceType: "web-chat",
            role: "user",
          }),
          source: expect.objectContaining({
            messageId: "user-message-2",
            channelId: "test-conversation",
            channelName: "Web Chat",
            metadata: expect.objectContaining({ trigger: "message" }),
          }),
        }),
      },
    ]);
  });

  it("propagates authenticated Admin and Anchor facets independently", async () => {
    const agent = createSpyAgentService();
    harness.setAgentService(agent);
    const plugin = new WebChatInterface(
      {},
      {
        resolveAuthPrincipal: async (): Promise<AuthPrincipal> => ({
          userId: "usr_owner",
          personId: "prsn_owner",
          displayName: "Owner",
          role: "admin",
          status: "active",
          permissionLevel: "admin",
          canonicalId: "user:owner",
          isAnchor: true,
        }),
      },
    );
    await harness.installPlugin(plugin);
    const route = getRoute(plugin, "/api/chat", "POST");

    const response = await route?.handler(
      new Request("http://brain/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: "test-conversation",
          messages: [
            {
              role: "user",
              parts: [{ type: "text", text: "Hello anchor" }],
            },
          ],
        }),
      }),
    );

    expect(response?.status).toBe(200);
    expect(agent.chatCalls).toHaveLength(1);
    expect(agent.chatCalls[0]?.context?.userPermissionLevel).toBe("admin");
    expect(agent.chatCalls[0]?.context?.isAnchor).toBe(true);
    expect(agent.chatCalls[0]?.context?.actor?.identity).toEqual({
      kind: "user",
      userId: "usr_owner",
      canonicalId: "user:owner",
    });
    expect(agent.chatCalls[0]?.context?.interfaceType).toBe("web-chat");
    expect(agent.chatCalls[0]?.context?.channelId).toBe("test-conversation");
    expect(agent.chatCalls[0]?.context?.channelName).toBe("Web Chat");
  });

  it("passes inline uploaded text file content to the agent as native attachments", async () => {
    const agent = createSpyAgentService();
    harness.setAgentService(agent);
    const plugin = adminPlugin();
    await harness.installPlugin(plugin);
    const route = getRoute(plugin, "/api/chat", "POST");

    const response = await route?.handler(
      new Request("http://brain/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: "test-conversation",
          messages: [
            {
              role: "user",
              parts: [
                { type: "text", text: "Summarize this" },
                {
                  type: "file",
                  mediaType: "text/markdown",
                  filename: "meeting-notes.md",
                  url: textDataUrl("# Notes\n\n- Ship uploads"),
                },
              ],
            },
          ],
        }),
      }),
    );

    expect(response?.status).toBe(200);
    expect(agent.chatCalls).toHaveLength(1);
    expect(agent.chatCalls[0]?.message).toBe("Summarize this");
    expect(agent.chatCalls[0]?.context?.attachments).toEqual([
      {
        kind: "text",
        filename: "meeting-notes.md",
        mediaType: "text/markdown",
        content: "# Notes\n\n- Ship uploads",
        sizeBytes: 23,
      },
    ]);
  });

  it("passes inline uploaded image file parts to the agent as native file attachments", async () => {
    const agent = createSpyAgentService();
    harness.setAgentService(agent);
    const plugin = adminPlugin();
    await harness.installPlugin(plugin);
    const route = getRoute(plugin, "/api/chat", "POST");
    const image = pngBytes();

    const response = await route?.handler(
      new Request("http://brain/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: "test-conversation",
          messages: [
            {
              role: "user",
              parts: [
                { type: "text", text: "Describe this" },
                {
                  type: "file",
                  mediaType: "image/png",
                  filename: "diagram.png",
                  url: pngDataUrl(image),
                },
              ],
            },
          ],
        }),
      }),
    );

    expect(response?.status).toBe(200);
    expect(agent.chatCalls[0]?.context?.attachments).toEqual([
      {
        kind: "file",
        filename: "diagram.png",
        mediaType: "image/png",
        data: image,
        sizeBytes: image.byteLength,
      },
    ]);
  });

  it("rejects unsupported uploaded file types", async () => {
    const agent = createSpyAgentService();
    harness.setAgentService(agent);
    const plugin = adminPlugin();
    await harness.installPlugin(plugin);
    const route = getRoute(plugin, "/api/chat", "POST");

    const response = await route?.handler(
      new Request("http://brain/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: "test-conversation",
          messages: [
            {
              role: "user",
              parts: [
                { type: "text", text: "Read this" },
                {
                  type: "file",
                  mediaType: "application/octet-stream",
                  filename: "archive.bin",
                  url: "data:application/octet-stream;base64,AAECAw==",
                },
              ],
            },
          ],
        }),
      }),
    );

    expect(response?.status).toBe(400);
    expect(await response?.text()).toContain("Unsupported file upload type");
    expect(agent.chatCalls).toHaveLength(0);
  });

  it("rejects binary content in an inline text file part", async () => {
    const agent = createSpyAgentService();
    harness.setAgentService(agent);
    const plugin = adminPlugin();
    await harness.installPlugin(plugin);
    const route = getRoute(plugin, "/api/chat", "POST");

    const binaryDataUrl = `data:text/plain;base64,${Buffer.from(
      new Uint8Array([0x68, 0x69, 0x00, 0xff]),
    ).toString("base64")}`;

    const response = await route?.handler(
      new Request("http://brain/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: "test-conversation",
          messages: [
            {
              role: "user",
              parts: [
                { type: "text", text: "Read this" },
                {
                  type: "file",
                  mediaType: "text/plain",
                  filename: "notes.txt",
                  url: binaryDataUrl,
                },
              ],
            },
          ],
        }),
      }),
    );

    expect(response?.status).toBe(400);
    expect(await response?.text()).toContain("Unsupported file upload type");
    expect(agent.chatCalls).toHaveLength(0);
  });

  it("rejects oversized uploaded text files", async () => {
    const agent = createSpyAgentService();
    harness.setAgentService(agent);
    const plugin = adminPlugin();
    await harness.installPlugin(plugin);
    const route = getRoute(plugin, "/api/chat", "POST");

    const response = await route?.handler(
      new Request("http://brain/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: "test-conversation",
          messages: [
            {
              role: "user",
              parts: [
                {
                  type: "file",
                  mediaType: "text/plain",
                  filename: "large.txt",
                  url: textDataUrl("x".repeat(100_001)),
                },
              ],
            },
          ],
        }),
      }),
    );

    expect(response?.status).toBe(400);
    expect(await response?.text()).toContain("File upload too large");
    expect(agent.chatCalls).toHaveLength(0);
  });

  it("rejects sessions list requests from unauthenticated callers", async () => {
    const shell = harness.getMockShell();
    shell.setConversationService(
      makeFixedConversationService({
        conversations: [makeConversation("web-session", "web-chat")],
        messagesByConversation: {
          "web-session": [
            makeMessage("message-1", "web-session", "user", "Hello"),
          ],
        },
      }),
    );
    const plugin = new WebChatInterface();
    await harness.installPlugin(plugin);
    const route = getRoute(plugin, "/api/chat/sessions", "GET");

    const response = await route?.handler(
      new Request("http://brain/api/chat/sessions"),
    );
    const body = await response?.text();

    expect(response?.status).toBe(403);
    expect(body).toBe("Forbidden");
  });

  it("lists only the Trusted person's sessions and never derives another title", async () => {
    const shell = harness.getMockShell();
    shell.setConversationService(
      makeFixedConversationService({
        conversations: [
          makeConversation("own-session", "web-chat", {
            personId: "prsn_collaborator",
          }),
          makeConversation("foreign-session", "web-chat", {
            personId: "prsn_other",
          }),
          makeConversation("legacy-session", "web-chat"),
        ],
        messagesByConversation: {
          "own-session": [
            makeMessage("message-own", "own-session", "user", "My thread"),
          ],
          "foreign-session": [
            makeMessage(
              "message-secret",
              "foreign-session",
              "user",
              "Another person's secret title",
            ),
          ],
          "legacy-session": [
            makeMessage(
              "message-legacy",
              "legacy-session",
              "user",
              "Unowned legacy title",
            ),
          ],
        },
      }),
    );
    const plugin = trustedAuthPlugin();
    await harness.installPlugin(plugin);
    const route = getRoute(plugin, "/api/chat/sessions", "GET");

    const response = await route?.handler(
      new Request("http://brain/api/chat/sessions"),
    );

    expect(response?.status).toBe(200);
    expect(await response?.json()).toEqual({
      sessions: [
        {
          id: "own-session",
          title: "My thread",
          lastActiveAt: "2026-05-24T00:01:00.000Z",
        },
      ],
    });
  });

  it("lists web chat sessions for a Trusted user", async () => {
    const shell = harness.getMockShell();
    shell.setConversationService(
      makeFixedConversationService({
        conversations: [
          makeConversation("web-session", "web-chat", {
            personId: "prsn_collaborator",
          }),
          makeConversation("discord-session", "discord", {
            metadata: JSON.stringify({ channelName: "Discord" }),
          }),
        ],
        messagesByConversation: {
          "web-session": [
            makeMessage(
              "message-1",
              "web-session",
              "user",
              "What did Rover do today?\nPlease summarize it.",
            ),
          ],
          "discord-session": [],
        },
      }),
    );
    const plugin = trustedAuthPlugin();
    await harness.installPlugin(plugin);
    const route = getRoute(plugin, "/api/chat/sessions", "GET");

    const response = await route?.handler(
      new Request("http://brain/api/chat/sessions"),
    );
    const body = await response?.json();

    expect(response?.status).toBe(200);
    expect(body).toEqual({
      sessions: [
        {
          id: "web-session",
          title: "What did Rover do today?",
          lastActiveAt: "2026-05-24T00:01:00.000Z",
        },
      ],
    });
  });

  it("uses renamed session titles from conversation metadata", async () => {
    const shell = harness.getMockShell();
    shell.setConversationService(
      makeFixedConversationService({
        conversations: [
          makeConversation("web-session", "web-chat", {
            metadata: JSON.stringify({
              channelName: "Web Chat",
              title: "Renamed thread",
            }),
          }),
        ],
        messagesByConversation: {
          "web-session": [
            makeMessage("message-1", "web-session", "user", "Original title"),
          ],
        },
      }),
    );
    const plugin = adminPlugin();
    await harness.installPlugin(plugin);
    const route = getRoute(plugin, "/api/chat/sessions", "GET");

    const response = await route?.handler(
      new Request("http://brain/api/chat/sessions"),
    );
    const body = await response?.json();

    expect(response?.status).toBe(200);
    expect(body.sessions[0].title).toBe("Renamed thread");
  });

  it("does not list archived web chat sessions", async () => {
    const shell = harness.getMockShell();
    shell.setConversationService(
      makeFixedConversationService({
        conversations: [
          makeConversation("active-session", "web-chat"),
          makeConversation("archived-session", "web-chat", {
            metadata: JSON.stringify({
              channelName: "Web Chat",
              archivedAt: "2026-05-24T00:02:00.000Z",
            }),
          }),
        ],
        messagesByConversation: {
          "active-session": [
            makeMessage("message-1", "active-session", "user", "Active"),
          ],
          "archived-session": [
            makeMessage("message-2", "archived-session", "user", "Archived"),
          ],
        },
      }),
    );
    const plugin = adminPlugin();
    await harness.installPlugin(plugin);
    const route = getRoute(plugin, "/api/chat/sessions", "GET");

    const response = await route?.handler(
      new Request("http://brain/api/chat/sessions"),
    );
    const body = await response?.json();

    expect(response?.status).toBe(200);
    expect(body.sessions.map((session: { id: string }) => session.id)).toEqual([
      "active-session",
    ]);
  });

  it("returns 404 for every Trusted read or mutation of another person's session", async () => {
    const updateCalls: unknown[] = [];
    const deleteCalls: string[] = [];
    harness.getMockShell().setConversationService(
      makeFixedConversationService({
        conversations: [
          makeConversation("foreign-session", "web-chat", {
            personId: "prsn_other",
          }),
        ],
        messagesByConversation: {
          "foreign-session": [
            makeMessage(
              "foreign-message",
              "foreign-session",
              "user",
              "Private conversation",
            ),
          ],
        },
        updateConversationMetadata: async (request): Promise<boolean> => {
          updateCalls.push(request);
          return true;
        },
        deleteConversation: async (conversationId): Promise<boolean> => {
          deleteCalls.push(conversationId);
          return true;
        },
      }),
    );
    const plugin = trustedAuthPlugin();
    await harness.installPlugin(plugin);

    const messages = await requireRoute(
      plugin,
      "/api/chat/messages",
      "GET",
    ).handler(new Request("http://brain/api/chat/messages?id=foreign-session"));
    const deleted = await requireRoute(
      plugin,
      "/api/chat/sessions",
      "DELETE",
    ).handler(
      new Request("http://brain/api/chat/sessions?id=foreign-session", {
        method: "DELETE",
      }),
    );
    const renamed = await requireRoute(
      plugin,
      "/api/chat/sessions",
      "PUT",
    ).handler(
      new Request("http://brain/api/chat/sessions?id=foreign-session", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "Stolen" }),
      }),
    );
    const archived = await requireRoute(
      plugin,
      "/api/chat/sessions/archive",
      "PUT",
    ).handler(
      new Request("http://brain/api/chat/sessions/archive?id=foreign-session", {
        method: "PUT",
      }),
    );

    expect([
      messages.status,
      deleted.status,
      renamed.status,
      archived.status,
    ]).toEqual([404, 404, 404, 404]);
    expect(updateCalls).toEqual([]);
    expect(deleteCalls).toEqual([]);
  });

  it("lets Admins read and mutate web-chat sessions across person owners", async () => {
    const updateCalls: unknown[] = [];
    const deleteCalls: string[] = [];
    harness.getMockShell().setConversationService(
      makeFixedConversationService({
        conversations: [
          makeConversation("member-session", "web-chat", {
            personId: "prsn_member",
          }),
        ],
        messagesByConversation: {
          "member-session": [
            makeMessage(
              "member-message",
              "member-session",
              "user",
              "Member thread",
            ),
          ],
        },
        updateConversationMetadata: async (request): Promise<boolean> => {
          updateCalls.push(request);
          return true;
        },
        deleteConversation: async (conversationId): Promise<boolean> => {
          deleteCalls.push(conversationId);
          return true;
        },
      }),
    );
    const plugin = adminPlugin();
    await harness.installPlugin(plugin);

    const sessions = await requireRoute(
      plugin,
      "/api/chat/sessions",
      "GET",
    ).handler(new Request("http://brain/api/chat/sessions"));
    const messages = await requireRoute(
      plugin,
      "/api/chat/messages",
      "GET",
    ).handler(new Request("http://brain/api/chat/messages?id=member-session"));
    const renamed = await requireRoute(
      plugin,
      "/api/chat/sessions",
      "PUT",
    ).handler(
      new Request("http://brain/api/chat/sessions?id=member-session", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "Admin rename" }),
      }),
    );
    const archived = await requireRoute(
      plugin,
      "/api/chat/sessions/archive",
      "PUT",
    ).handler(
      new Request("http://brain/api/chat/sessions/archive?id=member-session", {
        method: "PUT",
      }),
    );
    const deleted = await requireRoute(
      plugin,
      "/api/chat/sessions",
      "DELETE",
    ).handler(
      new Request("http://brain/api/chat/sessions?id=member-session", {
        method: "DELETE",
      }),
    );

    expect([
      sessions.status,
      messages.status,
      renamed.status,
      archived.status,
      deleted.status,
    ]).toEqual([200, 200, 200, 200, 200]);
    expect(updateCalls).toHaveLength(2);
    expect(deleteCalls).toEqual(["member-session"]);
  });

  it("rejects session deletes from unauthenticated callers", async () => {
    const shell = harness.getMockShell();
    shell.setConversationService(
      makeFixedConversationService({
        conversations: [makeConversation("web-session", "web-chat")],
        messagesByConversation: {},
      }),
    );
    const plugin = new WebChatInterface();
    await harness.installPlugin(plugin);
    const route = getRoute(plugin, "/api/chat/sessions", "DELETE");

    const response = await route?.handler(
      new Request("http://brain/api/chat/sessions?id=web-session", {
        method: "DELETE",
      }),
    );

    expect(response?.status).toBe(403);
  });

  it("deletes web chat sessions for an Admin", async () => {
    const shell = harness.getMockShell();
    const deleteCalls: string[] = [];
    shell.setConversationService(
      makeFixedConversationService({
        conversations: [makeConversation("web-session", "web-chat")],
        messagesByConversation: {},
        deleteConversation: async (conversationId): Promise<boolean> => {
          deleteCalls.push(conversationId);
          return true;
        },
      }),
    );
    const plugin = adminPlugin();
    await harness.installPlugin(plugin);
    const route = getRoute(plugin, "/api/chat/sessions", "DELETE");

    const response = await route?.handler(
      new Request("http://brain/api/chat/sessions?id=web-session", {
        method: "DELETE",
      }),
    );
    const body = await response?.json();

    expect(response?.status).toBe(200);
    expect(body).toEqual({ deleted: true });
    expect(deleteCalls).toEqual(["web-session"]);
  });

  it("does not delete sessions owned by other interfaces", async () => {
    const shell = harness.getMockShell();
    const deleteCalls: string[] = [];
    shell.setConversationService(
      makeFixedConversationService({
        conversations: [makeConversation("discord-session", "discord")],
        messagesByConversation: {},
        deleteConversation: async (conversationId): Promise<boolean> => {
          deleteCalls.push(conversationId);
          return true;
        },
      }),
    );
    const plugin = adminPlugin();
    await harness.installPlugin(plugin);
    const route = getRoute(plugin, "/api/chat/sessions", "DELETE");

    const response = await route?.handler(
      new Request("http://brain/api/chat/sessions?id=discord-session", {
        method: "DELETE",
      }),
    );

    expect(response?.status).toBe(404);
    expect(deleteCalls).toEqual([]);
  });

  it("rejects session deletes without an id", async () => {
    const plugin = adminPlugin();
    await harness.installPlugin(plugin);
    const route = getRoute(plugin, "/api/chat/sessions", "DELETE");

    const response = await route?.handler(
      new Request("http://brain/api/chat/sessions", { method: "DELETE" }),
    );

    expect(response?.status).toBe(400);
  });

  it("rejects session renames from unauthenticated callers", async () => {
    const shell = harness.getMockShell();
    shell.setConversationService(
      makeFixedConversationService({
        conversations: [makeConversation("web-session", "web-chat")],
        messagesByConversation: {},
      }),
    );
    const plugin = new WebChatInterface();
    await harness.installPlugin(plugin);
    const route = getRoute(plugin, "/api/chat/sessions", "PUT");

    const response = await route?.handler(
      new Request("http://brain/api/chat/sessions?id=web-session", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "Renamed thread" }),
      }),
    );

    expect(response?.status).toBe(403);
  });

  it("renames web chat sessions for an Admin", async () => {
    const shell = harness.getMockShell();
    const updateCalls: Array<{
      conversationId: string;
      metadata: Record<string, unknown>;
    }> = [];
    shell.setConversationService(
      makeFixedConversationService({
        conversations: [makeConversation("web-session", "web-chat")],
        messagesByConversation: {},
        updateConversationMetadata: async (request): Promise<boolean> => {
          updateCalls.push(request);
          return true;
        },
      }),
    );
    const plugin = adminPlugin();
    await harness.installPlugin(plugin);
    const route = getRoute(plugin, "/api/chat/sessions", "PUT");

    const response = await route?.handler(
      new Request("http://brain/api/chat/sessions?id=web-session", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "Renamed thread" }),
      }),
    );
    const body = await response?.json();

    expect(response?.status).toBe(200);
    expect(body).toEqual({ renamed: true, title: "Renamed thread" });
    expect(updateCalls).toEqual([
      { conversationId: "web-session", metadata: { title: "Renamed thread" } },
    ]);
  });

  it("does not rename sessions owned by other interfaces", async () => {
    const shell = harness.getMockShell();
    const updateCalls: unknown[] = [];
    shell.setConversationService(
      makeFixedConversationService({
        conversations: [makeConversation("discord-session", "discord")],
        messagesByConversation: {},
        updateConversationMetadata: async (request): Promise<boolean> => {
          updateCalls.push(request);
          return true;
        },
      }),
    );
    const plugin = adminPlugin();
    await harness.installPlugin(plugin);
    const route = getRoute(plugin, "/api/chat/sessions", "PUT");

    const response = await route?.handler(
      new Request("http://brain/api/chat/sessions?id=discord-session", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "Renamed thread" }),
      }),
    );

    expect(response?.status).toBe(404);
    expect(updateCalls).toEqual([]);
  });

  it("rejects invalid session rename requests", async () => {
    const shell = harness.getMockShell();
    shell.setConversationService(
      makeFixedConversationService({
        conversations: [makeConversation("web-session", "web-chat")],
        messagesByConversation: {},
      }),
    );
    const plugin = adminPlugin();
    await harness.installPlugin(plugin);
    const route = getRoute(plugin, "/api/chat/sessions", "PUT");

    const response = await route?.handler(
      new Request("http://brain/api/chat/sessions?id=web-session", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "" }),
      }),
    );

    expect(response?.status).toBe(400);
  });

  it("rejects session archives from unauthenticated callers", async () => {
    const shell = harness.getMockShell();
    shell.setConversationService(
      makeFixedConversationService({
        conversations: [makeConversation("web-session", "web-chat")],
        messagesByConversation: {},
      }),
    );
    const plugin = new WebChatInterface();
    await harness.installPlugin(plugin);
    const route = getRoute(plugin, "/api/chat/sessions/archive", "PUT");

    const response = await route?.handler(
      new Request("http://brain/api/chat/sessions/archive?id=web-session", {
        method: "PUT",
      }),
    );

    expect(response?.status).toBe(403);
  });

  it("archives web chat sessions for an Admin", async () => {
    const shell = harness.getMockShell();
    const updateCalls: Array<{
      conversationId: string;
      metadata: Record<string, unknown>;
    }> = [];
    shell.setConversationService(
      makeFixedConversationService({
        conversations: [makeConversation("web-session", "web-chat")],
        messagesByConversation: {},
        updateConversationMetadata: async (request): Promise<boolean> => {
          updateCalls.push(request);
          return true;
        },
      }),
    );
    const plugin = adminPlugin();
    await harness.installPlugin(plugin);
    const route = getRoute(plugin, "/api/chat/sessions/archive", "PUT");

    const response = await route?.handler(
      new Request("http://brain/api/chat/sessions/archive?id=web-session", {
        method: "PUT",
      }),
    );
    const body = await response?.json();

    expect(response?.status).toBe(200);
    expect(body).toEqual({ archived: true });
    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0]?.conversationId).toBe("web-session");
    expect(typeof updateCalls[0]?.metadata["archivedAt"]).toBe("string");
  });

  it("does not archive sessions owned by other interfaces", async () => {
    const shell = harness.getMockShell();
    const updateCalls: unknown[] = [];
    shell.setConversationService(
      makeFixedConversationService({
        conversations: [makeConversation("discord-session", "discord")],
        messagesByConversation: {},
        updateConversationMetadata: async (request): Promise<boolean> => {
          updateCalls.push(request);
          return true;
        },
      }),
    );
    const plugin = adminPlugin();
    await harness.installPlugin(plugin);
    const route = getRoute(plugin, "/api/chat/sessions/archive", "PUT");

    const response = await route?.handler(
      new Request("http://brain/api/chat/sessions/archive?id=discord-session", {
        method: "PUT",
      }),
    );

    expect(response?.status).toBe(404);
    expect(updateCalls).toEqual([]);
  });

  it("refuses to load session messages for unauthenticated callers", async () => {
    const shell = harness.getMockShell();
    shell.setConversationService(
      makeFixedConversationService({
        conversations: [makeConversation("web-session", "web-chat")],
        messagesByConversation: {
          "web-session": [
            makeMessage("message-1", "web-session", "user", "Hello"),
          ],
        },
      }),
    );
    const plugin = new WebChatInterface();
    await harness.installPlugin(plugin);
    const route = getRoute(plugin, "/api/chat/messages", "GET");

    const response = await route?.handler(
      new Request("http://brain/api/chat/messages?id=web-session"),
    );

    expect(response?.status).toBe(403);
  });

  it("loads stored generated attachment, source citation, and action cards for an Admin", async () => {
    const actionsCard = {
      kind: "actions",
      id: "actions:onboarding",
      title: "Next steps",
      actions: [
        {
          type: "prompt",
          id: "review-draft",
          label: "Review draft",
          prompt: "Show me the transformed draft.",
        },
      ],
    };
    const sourcesCard = {
      kind: "sources",
      id: "sources:agent-context",
      title: "Retrieved context",
      sources: [
        {
          id: "summary-1",
          title: "Relay decision summary",
          source: "conversation-memory",
          entityType: "summary",
          entityId: "summary-1",
          excerpt: "The team decided to use explicit memory retrieval.",
        },
      ],
    };
    const card = {
      kind: "attachment",
      id: "attachment:mossy-robot",
      jobId: "job-1",
      title: "mossy-robot.png",
      description: "image generation has been queued.",
      attachment: {
        mediaType: "image/png",
        url: "/api/chat/attachments/image?id=mossy-robot",
        downloadUrl: "/api/chat/attachments/image?id=mossy-robot&download=1",
        filename: "mossy-robot.png",
        source: {
          entityType: "image",
          entityId: "mossy-robot",
          attachmentType: "generated",
        },
      },
    };
    const shell = harness.getMockShell();
    shell.setConversationService(
      makeFixedConversationService({
        conversations: [makeConversation("web-session", "web-chat")],
        messagesByConversation: {
          "web-session": [
            makeMessage(
              "message-1",
              "web-session",
              "assistant",
              'Queued image generation.\n\n[Entities affected this turn: image "mossy-robot" (generating). Reference these IDs directly in follow-ups instead of searching for them.]',
              JSON.stringify({ cards: [card, sourcesCard, actionsCard] }),
            ),
          ],
        },
      }),
    );
    const plugin = adminPlugin();
    await harness.installPlugin(plugin);
    const route = getRoute(plugin, "/api/chat/messages", "GET");

    const response = await route?.handler(
      new Request("http://brain/api/chat/messages?id=web-session"),
    );
    const body = await response?.json();

    expect(response?.status).toBe(200);
    expect(body).toEqual({
      messages: [
        {
          id: "message-1",
          role: "assistant",
          content: "Queued image generation.",
          cards: [card, sourcesCard, actionsCard],
        },
      ],
    });
  });

  it("loads web chat session messages for an Admin", async () => {
    const shell = harness.getMockShell();
    shell.setConversationService(
      makeFixedConversationService({
        conversations: [makeConversation("web-session", "web-chat")],
        messagesByConversation: {
          "web-session": [
            makeMessage(
              "message-1",
              "web-session",
              "user",
              "Hello",
              JSON.stringify({
                attachments: [
                  {
                    kind: "text",
                    filename: "notes.md",
                    mediaType: "text/markdown",
                    sizeBytes: 7,
                    source: { kind: "upload", id: "upload-123" },
                  },
                ],
              }),
            ),
          ],
        },
      }),
    );
    const plugin = adminPlugin();
    await harness.installPlugin(plugin);
    const route = getRoute(plugin, "/api/chat/messages", "GET");

    const response = await route?.handler(
      new Request("http://brain/api/chat/messages?id=web-session"),
    );
    const body = await response?.json();

    expect(response?.status).toBe(200);
    expect(body).toEqual({
      messages: [
        {
          id: "message-1",
          role: "user",
          content: "Hello",
          attachments: [
            {
              kind: "text",
              filename: "notes.md",
              mediaType: "text/markdown",
              sizeBytes: 7,
              createdAt: "2026-05-24T00:00:30.000Z",
              source: { kind: "upload", id: "upload-123" },
            },
          ],
        },
      ],
    });
  });

  it("rejects malformed chat POSTs", async () => {
    const plugin = adminPlugin();
    await harness.installPlugin(plugin);
    const route = getRoute(plugin, "/api/chat", "POST");

    const response = await route?.handler(
      new Request("http://brain/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: [] }),
      }),
    );

    expect(response?.status).toBe(400);
  });

  it("generates unique conversation ids across many calls", async () => {
    const plugin = adminPlugin();
    await harness.installPlugin(plugin);
    const route = getRoute(plugin, "/api/chat", "POST");

    const ids = new Set<string>();
    for (let i = 0; i < 1000; i += 1) {
      const response = await route?.handler(
        new Request("http://brain/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messages: [
              {
                role: "user",
                parts: [{ type: "text", text: `Hello ${i}` }],
              },
            ],
          }),
        }),
      );
      const body = (await response?.text()) ?? "";
      const match = /text-[0-9a-f-]+/.exec(body);
      if (match) ids.add(match[0]);
    }

    expect(ids.size).toBeGreaterThan(990);
  });
});
