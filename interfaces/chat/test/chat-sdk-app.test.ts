import { createMockShell } from "@brains/plugins/test";
import { describe, it, expect, mock, type Mock } from "bun:test";
import type { WebRouteDefinition } from "@brains/plugins";
import { caughtError } from "@brains/test-utils";
import { ChatSdkAppHost, type ChatSdkApp } from "../src/chat-sdk-app";
import type { SlackChatAdapterConfig } from "../src/config";

// Inject the app; no transport module mocks or upload stores.
const SLACK_CONFIG: SlackChatAdapterConfig = {
  botToken: "slack-token",
  mode: "webhook",
  signingSecret: "slack-signing-secret",
  allowedChannels: [],
  blockedUrlDomains: [],
  requireMention: true,
  allowDMs: true,
  showTypingIndicator: true,
  captureUrls: false,
};
interface FakeApp extends ChatSdkApp {
  initialize: Mock<() => Promise<void>>;
  shutdown: Mock<() => Promise<void>>;
  webhooks: {
    discord?: Mock<(request: Request) => Promise<Response>>;
    slack?: Mock<(request: Request) => Promise<Response>>;
  };
}
function createFakeApp(options?: { withWebhook?: boolean }): FakeApp {
  return {
    initialize: mock(() => Promise.resolve()),
    shutdown: mock(() => Promise.resolve()),
    webhooks:
      options?.withWebhook === false
        ? {}
        : {
            discord: mock(() => Promise.resolve(new Response("webhook ok"))),
            slack: mock(() =>
              Promise.resolve(new Response("slack webhook ok")),
            ),
          },
    onDirectMessage: (): void => {},
    onNewMention: (): void => {},
    onNewMessage: (): void => {},
    onSubscribedMessage: (): void => {},
    onAction: (): void => {},
  };
}
function makeApp(options?: {
  slack?: SlackChatAdapterConfig | undefined;
  app?: FakeApp;
  build?: boolean;
}): {
  host: ChatSdkAppHost;
  app: FakeApp;
  buildApp: Mock<() => ChatSdkApp>;
} {
  const app = options?.app ?? createFakeApp();
  const buildApp = mock(() => app);
  const host = new ChatSdkAppHost({
    slack: options && "slack" in options ? options.slack : SLACK_CONFIG,
    buildApp,
  });
  if (options?.build !== false) host.build(createMockShell().getRuntimeState());
  return { host, app, buildApp };
}
function webhookRoute(
  host: ChatSdkAppHost,
  platform: string,
): WebRouteDefinition {
  const route = host
    .getWebRoutes()
    .find((candidate) => candidate.path === `/api/webhooks/chat/${platform}`);
  if (!route) throw new Error("Webhook route missing");
  return route;
}
describe("ChatSdkAppHost", () => {
  it("builds the app once and exposes it for handler registration", () => {
    const { host, app, buildApp } = makeApp();
    expect(buildApp).toHaveBeenCalledTimes(1);
    expect(host.instance).toBe(app);
  });
  it.each(["discord", "slack"])(
    "delegates the %s webhook to the built app",
    async (platform) => {
      const { host } = makeApp();
      const response = await webhookRoute(host, platform).handler(
        new Request("https://brain.test/hook"),
      );
      expect(response.status).toBe(200);
      expect(await response.text()).toBe(
        platform === "slack" ? "slack webhook ok" : "webhook ok",
      );
    },
  );
  it.each(["discord", "slack"])(
    "returns 404 when the app has no %s webhook",
    async (platform) => {
      const { host } = makeApp({ app: createFakeApp({ withWebhook: false }) });
      const response = await webhookRoute(host, platform).handler(
        new Request("https://brain.test/hook"),
      );
      expect(response.status).toBe(404);
      expect(await response.text()).toBe(
        `${platform === "slack" ? "Slack" : "Discord"} chat webhook not configured`,
      );
    },
  );
  it("returns 404 from the Slack webhook in Socket Mode", async () => {
    const { host } = makeApp({
      slack: {
        ...SLACK_CONFIG,
        mode: "socket",
        signingSecret: undefined,
        appToken: "xapp-test",
      },
    });
    const response = await webhookRoute(host, "slack").handler(
      new Request("https://brain.test/hook"),
    );
    expect(response.status).toBe(404);
    expect(await response.text()).toBe("Slack chat webhook not configured");
  });
  it("exposes only webhook POSTs, with no legacy upload routes", () => {
    const { host } = makeApp();
    expect(
      host.getWebRoutes().map(({ path, method }) => ({ path, method })),
    ).toEqual([
      { path: "/api/webhooks/chat/discord", method: "POST" },
      { path: "/api/webhooks/chat/slack", method: "POST" },
    ]);
  });
  it("delegates initialize and shutdown to the built app", async () => {
    const { host, app } = makeApp();
    await host.initialize();
    await host.shutdown();
    expect(app.initialize).toHaveBeenCalledTimes(1);
    expect(app.shutdown).toHaveBeenCalledTimes(1);
  });
  it("throws when initialized before the app is built", async () => {
    const { host } = makeApp({ build: false });
    let caught: unknown;
    try {
      await host.initialize();
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(Error);
    expect(caughtError(caught).message).toBe("Chat SDK app not initialized");
  });
});
