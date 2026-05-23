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

  it("exposes chat page and AI SDK chat endpoint routes", async () => {
    const plugin = new WebChatInterface();
    await harness.installPlugin(plugin);

    const routes = plugin.getWebRoutes();

    expect(routes).toHaveLength(2);
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
