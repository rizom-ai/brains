import { describe, expect, it, beforeEach, afterEach } from "bun:test";
import type { IAgentService, IConversationService } from "@brains/plugins";
import {
  createPluginHarness,
  type PluginTestHarness,
} from "@brains/plugins/test";
import { WebChatInterface } from "../src";

type ChatContext = Parameters<IAgentService["chat"]>[2];
type AgentResponse = Awaited<ReturnType<IAgentService["chat"]>>;
type Conversation = NonNullable<
  Awaited<ReturnType<IConversationService["getConversation"]>>
>;
type Message = Awaited<ReturnType<IConversationService["getMessages"]>>[number];

interface AgentChatCall {
  message: string;
  conversationId: string;
  context: ChatContext | undefined;
}

interface AgentConfirmCall {
  conversationId: string;
  confirmed: boolean;
  approvalId: string | undefined;
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
      approvalId?: string,
    ): Promise<AgentResponse> => {
      confirmCalls.push({ conversationId, confirmed, approvalId });
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
): Message {
  return {
    id,
    conversationId,
    role,
    content,
    timestamp: "2026-05-24T00:00:30.000Z",
    metadata: null,
  };
}

function makeFixedConversationService(input: {
  conversations: Conversation[];
  messagesByConversation: Record<string, Message[]>;
}): IConversationService {
  return {
    startConversation: async () => "web-session",
    addMessage: async (): Promise<void> => {},
    getConversation: async (conversationId: string) =>
      input.conversations.find((c) => c.id === conversationId) ?? null,
    listConversations: async (options) =>
      input.conversations.filter(
        (c) =>
          options?.interfaceType === undefined ||
          c.interfaceType === options.interfaceType,
      ),
    searchConversations: async () => [],
    getMessages: async (conversationId: string) =>
      input.messagesByConversation[conversationId] ?? [],
    countMessages: async (conversationId: string) =>
      (input.messagesByConversation[conversationId] ?? []).length,
    close: (): void => {},
  };
}

function operatorPlugin(): WebChatInterface {
  return new WebChatInterface({}, { resolveOperatorSession: async () => true });
}

describe("WebChatInterface", () => {
  let harness: PluginTestHarness<WebChatInterface>;

  beforeEach(() => {
    harness = createPluginHarness<WebChatInterface>();
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
  });

  it("exposes chat page, AI SDK endpoint, and UI asset routes", async () => {
    const plugin = new WebChatInterface();
    await harness.installPlugin(plugin);

    const routes = plugin.getWebRoutes();

    expect(routes).toHaveLength(5);
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
      path: "/api/chat/sessions",
      method: "GET",
      public: true,
    });
    expect(routes[3]).toMatchObject({
      path: "/api/chat/messages",
      method: "GET",
      public: true,
    });
    expect(routes[4]).toMatchObject({
      path: "/chat/assets/app.js",
      method: "GET",
      public: true,
    });
  });

  it("requires operator auth for the chat page", async () => {
    const plugin = new WebChatInterface();
    await harness.installPlugin(plugin);
    const route = plugin.getWebRoutes()[0];

    const response = await route?.handler(new Request("http://brain/chat"));
    const text = await response?.text();

    expect(response?.status).toBe(401);
    expect(text).toContain("Operator login required");
  });

  it("serves the chat page for operators", async () => {
    const plugin = operatorPlugin();
    await harness.installPlugin(plugin);
    const route = plugin.getWebRoutes()[0];

    const response = await route?.handler(new Request("http://brain/chat"));
    const html = await response?.text();

    expect(response?.status).toBe(200);
    expect(response?.headers.get("content-type")).toContain("text/html");
    expect(html).toContain("Brain Chat");
    expect(html).toContain("/chat/assets/app.js");
    expect(html).toContain("data-web-chat-styles");
    expect(html).toContain("--chat-bg:");
    expect(html).toContain("--chat-accent:");
    expect(html).toContain('[data-theme="light"]');
  });

  it("does not reach out to fonts.googleapis.com from the chat page", async () => {
    const plugin = operatorPlugin();
    await harness.installPlugin(plugin);
    const route = plugin.getWebRoutes()[0];

    const response = await route?.handler(new Request("http://brain/chat"));
    const html = await response?.text();

    expect(html).not.toContain("fonts.googleapis.com");
    expect(html).not.toContain("fonts.gstatic.com");
    expect(html).not.toContain("Fraunces");
  });

  it("serves the React UI asset when built or a clear 404 otherwise", async () => {
    const plugin = new WebChatInterface();
    await harness.installPlugin(plugin);
    const route = plugin.getWebRoutes()[4];

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

  it("rejects chat POSTs without an operator session", async () => {
    const agent = createSpyAgentService();
    harness.setAgentService(agent);
    const plugin = new WebChatInterface();
    await harness.installPlugin(plugin);
    const route = plugin.getWebRoutes()[1];

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
      pendingConfirmation: {
        id: "approval:call-1",
        toolCallId: "call-1",
        toolName: "delete_note",
        summary: "Delete note?",
        args: { noteId: "123" },
      },
      usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
    });
    harness.setAgentService(agent);
    const plugin = operatorPlugin();
    await harness.installPlugin(plugin);
    const route = plugin.getWebRoutes()[1];

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

  it("handles AI SDK approval responses through the chat endpoint", async () => {
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
    const plugin = operatorPlugin();
    await harness.installPlugin(plugin);
    const route = plugin.getWebRoutes()[1];

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
      {
        conversationId: "test-conversation",
        confirmed: true,
        approvalId: "approval:call-1",
      },
    ]);
    expect(body).toContain("tool-output-available");
    expect(body).toContain("call-1");
  });

  it("passes anchor permission level when caller has an operator session", async () => {
    const agent = createSpyAgentService();
    harness.setAgentService(agent);
    const plugin = operatorPlugin();
    await harness.installPlugin(plugin);
    const route = plugin.getWebRoutes()[1];

    const response = await route?.handler(
      new Request("http://brain/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: "test-conversation",
          messages: [
            {
              role: "user",
              parts: [{ type: "text", text: "Hello operator" }],
            },
          ],
        }),
      }),
    );

    expect(response?.status).toBe(200);
    expect(agent.chatCalls).toHaveLength(1);
    expect(agent.chatCalls[0]?.context?.userPermissionLevel).toBe("anchor");
  });

  it("rejects sessions list requests from non-operators", async () => {
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
    const route = plugin.getWebRoutes()[2];

    const response = await route?.handler(
      new Request("http://brain/api/chat/sessions"),
    );
    const body = await response?.text();

    expect(response?.status).toBe(403);
    expect(body).toBe("Forbidden");
  });

  it("lists web chat sessions for an operator", async () => {
    const shell = harness.getMockShell();
    shell.setConversationService(
      makeFixedConversationService({
        conversations: [
          makeConversation("web-session", "web-chat"),
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
    const plugin = operatorPlugin();
    await harness.installPlugin(plugin);
    const route = plugin.getWebRoutes()[2];

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

  it("refuses to load session messages for non-operators", async () => {
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
    const route = plugin.getWebRoutes()[3];

    const response = await route?.handler(
      new Request("http://brain/api/chat/messages?id=web-session"),
    );

    expect(response?.status).toBe(403);
  });

  it("loads web chat session messages for an operator", async () => {
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
    const plugin = operatorPlugin();
    await harness.installPlugin(plugin);
    const route = plugin.getWebRoutes()[3];

    const response = await route?.handler(
      new Request("http://brain/api/chat/messages?id=web-session"),
    );
    const body = await response?.json();

    expect(response?.status).toBe(200);
    expect(body).toEqual({
      messages: [{ id: "message-1", role: "user", content: "Hello" }],
    });
  });

  it("rejects malformed chat POSTs", async () => {
    const plugin = operatorPlugin();
    await harness.installPlugin(plugin);
    const route = plugin.getWebRoutes()[1];

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
    const plugin = operatorPlugin();
    await harness.installPlugin(plugin);
    const route = plugin.getWebRoutes()[1];

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
