import { describe, expect, it, beforeEach, afterEach } from "bun:test";
import {
  createPluginHarness,
  type PluginTestHarness,
} from "@brains/plugins/test";
import { WebChatInterface } from "../src";

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

    expect(routes).toHaveLength(6);
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
      path: "/api/chat/confirm",
      method: "POST",
      public: true,
    });
    expect(routes[3]).toMatchObject({
      path: "/api/chat/sessions",
      method: "GET",
      public: true,
    });
    expect(routes[4]).toMatchObject({
      path: "/api/chat/messages",
      method: "GET",
      public: true,
    });
    expect(routes[5]).toMatchObject({
      path: "/chat/assets/app.js",
      method: "GET",
      public: true,
    });
  });

  it("serves the chat page", async () => {
    const plugin = new WebChatInterface();
    await harness.installPlugin(plugin);
    const route = plugin.getWebRoutes()[0];

    const response = await route?.handler(new Request("http://brain/chat"));
    const html = await response?.text();

    expect(response?.status).toBe(200);
    expect(response?.headers.get("content-type")).toContain("text/html");
    expect(html).toContain("Brain Chat");
    expect(html).toContain("/chat/assets/app.js");
    expect(html).toContain("data-web-chat-styles");
    expect(html).toContain("--color-bg: var(--palette-bg-deep)");
    expect(html).toContain("--color-accent: var(--palette-amber-light)");
  });

  it("serves the React UI asset when built or a clear 404 otherwise", async () => {
    const plugin = new WebChatInterface();
    await harness.installPlugin(plugin);
    const route = plugin.getWebRoutes()[5];

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

  it("routes chat POSTs through AgentService and returns an AI SDK UI stream", async () => {
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
    const body = await response?.text();

    expect(response?.status).toBe(200);
    expect(response?.headers.get("content-type")).toContain(
      "text/event-stream",
    );
    expect(body).toContain("Mock agent response");
  });

  it("lists web chat sessions", async () => {
    const shell = harness.getMockShell();
    shell.getConversationService = () => ({
      startConversation: async () => "web-session",
      addMessage: async () => {},
      getConversation: async () => null,
      listConversations: async (options) => {
        const conversations = [
          {
            id: "web-session",
            sessionId: "web-session",
            interfaceType: "web-chat",
            channelId: "web-session",
            started: "2026-05-24T00:00:00.000Z",
            lastActive: "2026-05-24T00:01:00.000Z",
            created: "2026-05-24T00:00:00.000Z",
            updated: "2026-05-24T00:01:00.000Z",
            metadata: JSON.stringify({ channelName: "Web Chat" }),
          },
          {
            id: "discord-session",
            sessionId: "discord-session",
            interfaceType: "discord",
            channelId: "discord-session",
            started: "2026-05-24T00:00:00.000Z",
            lastActive: "2026-05-24T00:01:00.000Z",
            created: "2026-05-24T00:00:00.000Z",
            updated: "2026-05-24T00:01:00.000Z",
            metadata: JSON.stringify({ channelName: "Discord" }),
          },
        ];
        return conversations.filter(
          (conversation) =>
            conversation.interfaceType === options?.interfaceType,
        );
      },
      searchConversations: async () => [],
      getMessages: async () => [],
      countMessages: async () => 0,
      close: () => {},
    });
    const plugin = new WebChatInterface();
    await harness.installPlugin(plugin);
    const route = plugin.getWebRoutes()[3];

    const response = await route?.handler(
      new Request("http://brain/api/chat/sessions"),
    );
    const body = await response?.json();

    expect(response?.status).toBe(200);
    expect(body).toEqual({
      sessions: [
        {
          id: "web-session",
          title: "Web Chat",
          lastActiveAt: "2026-05-24T00:01:00.000Z",
        },
      ],
    });
  });

  it("loads web chat session messages", async () => {
    const shell = harness.getMockShell();
    shell.getConversationService = () => ({
      startConversation: async () => "web-session",
      addMessage: async () => {},
      getConversation: async () => ({
        id: "web-session",
        sessionId: "web-session",
        interfaceType: "web-chat",
        channelId: "web-session",
        started: "2026-05-24T00:00:00.000Z",
        lastActive: "2026-05-24T00:01:00.000Z",
        created: "2026-05-24T00:00:00.000Z",
        updated: "2026-05-24T00:01:00.000Z",
        metadata: JSON.stringify({ channelName: "Web Chat" }),
      }),
      listConversations: async () => [],
      searchConversations: async () => [],
      getMessages: async () => [
        {
          id: "message-1",
          conversationId: "web-session",
          role: "user",
          content: "Hello",
          timestamp: "2026-05-24T00:00:30.000Z",
          metadata: null,
        },
      ],
      countMessages: async () => 1,
      close: () => {},
    });
    const plugin = new WebChatInterface();
    await harness.installPlugin(plugin);
    const route = plugin.getWebRoutes()[4];

    const response = await route?.handler(
      new Request("http://brain/api/chat/messages?id=web-session"),
    );
    const body = await response?.json();

    expect(response?.status).toBe(200);
    expect(body).toEqual({
      messages: [{ id: "message-1", role: "user", content: "Hello" }],
    });
  });

  it("confirms pending actions through AgentService", async () => {
    const plugin = new WebChatInterface();
    await harness.installPlugin(plugin);
    const route = plugin.getWebRoutes()[2];

    const response = await route?.handler(
      new Request("http://brain/api/chat/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: "test-conversation", confirmed: true }),
      }),
    );
    const body = await response?.json();

    expect(response?.status).toBe(200);
    expect(body).toMatchObject({ text: "Action confirmed." });
  });

  it("rejects malformed confirmation POSTs", async () => {
    const plugin = new WebChatInterface();
    await harness.installPlugin(plugin);
    const route = plugin.getWebRoutes()[2];

    const response = await route?.handler(
      new Request("http://brain/api/chat/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: "test-conversation" }),
      }),
    );

    expect(response?.status).toBe(400);
  });

  it("rejects malformed chat POSTs", async () => {
    const plugin = new WebChatInterface();
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
});
