import { createMockShell } from "@brains/plugins/test";
import { describe, it, expect, mock } from "bun:test";
import type { Mock } from "bun:test";
import type { WebRouteDefinition } from "@brains/plugins";
import { caughtError } from "@brains/test-utils";
import { ChatSdkAppHost, type ChatSdkApp } from "../src/chat-sdk-app";
import type { SlackChatAdapterConfig } from "../src/config";

// No module mocks: ChatSdkAppHost imports no SDK at runtime, and the app it
// drives is injected via `buildApp`. The test supplies a plain fake app.

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
    channel: (): never => {
      throw new Error("These tests post into no channel");
    },
  };
}

function makeApp(options?: {
  slack?: SlackChatAdapterConfig | undefined;
  app?: FakeApp;
  build?: boolean;
}): {
  discordApp: ChatSdkAppHost;
  app: FakeApp;
  buildApp: Mock<() => ChatSdkApp>;
} {
  const app = options?.app ?? createFakeApp();
  const buildApp = mock(() => app);
  const discordApp = new ChatSdkAppHost({
    slack: options && "slack" in options ? options.slack : SLACK_CONFIG,
    buildApp,
  });
  if (options?.build !== false) {
    discordApp.build(createMockShell().getRuntimeState());
  }
  return { discordApp, app, buildApp };
}

function webhookRoute(discordApp: ChatSdkAppHost): WebRouteDefinition {
  const route = discordApp
    .getWebRoutes()
    .find((candidate) => candidate.path === "/api/webhooks/chat/discord");
  if (!route) throw new Error("webhook route missing");
  return route;
}

function slackWebhookRoute(discordApp: ChatSdkAppHost): WebRouteDefinition {
  const route = discordApp
    .getWebRoutes()
    .find((candidate) => candidate.path === "/api/webhooks/chat/slack");
  if (!route) throw new Error("Slack webhook route missing");
  return route;
}

describe("ChatSdkAppHost", () => {
  it("builds the app once and exposes it for handler registration", () => {
    const { discordApp, app, buildApp } = makeApp();
    expect(buildApp).toHaveBeenCalledTimes(1);
    expect(discordApp.instance).toBe(app);
  });

  it("delegates the webhook route to the built app", async () => {
    const { discordApp } = makeApp();
    const response = await webhookRoute(discordApp).handler(
      new Request("https://brain.test/hook"),
    );
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("webhook ok");
  });

  it("returns 404 from the webhook route when the app has no Discord webhook", async () => {
    const { discordApp } = makeApp({
      app: createFakeApp({ withWebhook: false }),
    });
    const response = await webhookRoute(discordApp).handler(
      new Request("https://brain.test/hook"),
    );
    expect(response.status).toBe(404);
    expect(await response.text()).toBe("Discord chat webhook not configured");
  });

  it("delegates the Slack webhook to the built app", async () => {
    const { discordApp } = makeApp();
    const response = await slackWebhookRoute(discordApp).handler(
      new Request("https://brain.test/slack-hook"),
    );
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("slack webhook ok");
  });

  it("returns 404 from the Slack webhook in Socket Mode", async () => {
    const { discordApp } = makeApp({
      slack: {
        ...SLACK_CONFIG,
        mode: "socket",
        signingSecret: undefined,
        appToken: "xapp-test",
      },
    });
    const response = await slackWebhookRoute(discordApp).handler(
      new Request("https://brain.test/slack-hook"),
    );
    expect(response.status).toBe(404);
    expect(await response.text()).toBe("Slack chat webhook not configured");
  });

  it("returns 404 when the app has no Slack webhook", async () => {
    const { discordApp } = makeApp({
      app: createFakeApp({ withWebhook: false }),
    });
    const response = await slackWebhookRoute(discordApp).handler(
      new Request("https://brain.test/slack-hook"),
    );
    expect(response.status).toBe(404);
    expect(await response.text()).toBe("Slack chat webhook not configured");
  });

  it("serves the webhooks and no platform upload route", () => {
    const { discordApp } = makeApp();

    expect(
      discordApp.getWebRoutes().map(({ method, path }) => `${method} ${path}`),
    ).toEqual([
      "POST /api/webhooks/chat/discord",
      "POST /api/webhooks/chat/slack",
    ]);
  });

  it("delegates initialize and shutdown to the built app", async () => {
    const { discordApp, app } = makeApp();
    await discordApp.initialize();
    await discordApp.shutdown();
    expect(app.initialize).toHaveBeenCalledTimes(1);
    expect(app.shutdown).toHaveBeenCalledTimes(1);
  });

  it("throws when initialized before the app is built", async () => {
    const { discordApp } = makeApp({ build: false });
    let caught: unknown;
    try {
      await discordApp.initialize();
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(Error);
    expect(caughtError(caught).message).toBe("Chat SDK app not initialized");
  });
});
