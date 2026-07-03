import { describe, it, expect, mock } from "bun:test";
import type { Mock } from "bun:test";
import type { RuntimeUploadStore, WebRouteDefinition } from "@brains/plugins";
import { DiscordChatApp, type ChatSdkApp } from "../src/discord-chat-app";
import type { DiscordChatAdapterConfig } from "../src/config";

// No module mocks: DiscordChatApp imports no SDK at runtime, and the app it
// drives is injected via `buildApp`. The test supplies a plain fake app.

const DISCORD_CONFIG: DiscordChatAdapterConfig = {
  botToken: "discord-token",
  publicKey: "a".repeat(64),
  applicationId: "bot-user-123",
  mentionRoleIds: [],
  allowedChannels: [],
  blockedUrlDomains: [],
  requireMention: true,
  allowDMs: true,
  showTypingIndicator: true,
  useThreads: true,
  captureUrls: true,
  captureUrlEmoji: "🔖",
};

interface FakeApp extends ChatSdkApp {
  initialize: Mock<() => Promise<void>>;
  shutdown: Mock<() => Promise<void>>;
  webhooks: { discord?: Mock<(request: Request) => Promise<Response>> };
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
          },
    onDirectMessage: (): void => {},
    onNewMention: (): void => {},
    onNewMessage: (): void => {},
    onSubscribedMessage: (): void => {},
    onAction: (): void => {},
  };
}

function createUploadStore(
  read?: RuntimeUploadStore["read"],
): RuntimeUploadStore {
  return {
    read:
      read ??
      mock(async (id: string) => ({
        record: {
          id,
          filename: "report.pdf",
          mediaType: "application/pdf",
          ref: "discord-chat-upload",
        },
        content: Buffer.from("%PDF-1.7"),
      })),
  } as unknown as RuntimeUploadStore;
}

function makeApp(options?: {
  discord?: DiscordChatAdapterConfig | undefined;
  uploadStore?: RuntimeUploadStore | undefined;
  app?: FakeApp;
  build?: boolean;
}): {
  discordApp: DiscordChatApp;
  app: FakeApp;
  buildApp: Mock<() => ChatSdkApp>;
} {
  const app = options?.app ?? createFakeApp();
  const buildApp = mock(() => app);
  const discordApp = new DiscordChatApp({
    discord: options && "discord" in options ? options.discord : DISCORD_CONFIG,
    getUploadStore: (): RuntimeUploadStore | undefined =>
      options && "uploadStore" in options
        ? options.uploadStore
        : createUploadStore(),
    buildApp,
  });
  if (options?.build !== false) discordApp.build({} as never);
  return { discordApp, app, buildApp };
}

function uploadRoute(discordApp: DiscordChatApp): WebRouteDefinition {
  const route = discordApp
    .getWebRoutes()
    .find(
      (candidate) =>
        candidate.path === "/api/webhooks/chat/discord/uploads" &&
        candidate.method === "GET",
    );
  if (!route) throw new Error("upload route missing");
  return route;
}

function webhookRoute(discordApp: DiscordChatApp): WebRouteDefinition {
  const route = discordApp
    .getWebRoutes()
    .find((candidate) => candidate.path === "/api/webhooks/chat/discord");
  if (!route) throw new Error("webhook route missing");
  return route;
}

describe("DiscordChatApp", () => {
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

  it("serves stored upload refs with inline and download dispositions", async () => {
    const { discordApp } = makeApp();
    const inline = await uploadRoute(discordApp).handler(
      new Request("https://brain.test/api/webhooks/chat/discord/uploads?id=u1"),
    );
    const download = await uploadRoute(discordApp).handler(
      new Request(
        "https://brain.test/api/webhooks/chat/discord/uploads?id=u1&download=1",
      ),
    );

    expect(inline.status).toBe(200);
    expect(inline.headers.get("Content-Type")).toBe("application/pdf");
    expect(inline.headers.get("Cache-Control")).toBe("private, no-store");
    expect(inline.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(inline.headers.get("Content-Disposition")).toContain("inline;");
    expect(await inline.text()).toBe("%PDF-1.7");
    expect(download.headers.get("Content-Disposition")).toContain(
      "attachment;",
    );
  });

  it("returns 404 from the upload route when Discord is not configured", async () => {
    const { discordApp } = makeApp({ discord: undefined });
    const response = await uploadRoute(discordApp).handler(
      new Request("https://brain.test/api/webhooks/chat/discord/uploads?id=u1"),
    );
    expect(response.status).toBe(404);
    expect(await response.text()).toBe("Discord chat uploads not configured");
  });

  it("rejects a missing upload id with 400", async () => {
    const { discordApp } = makeApp();
    const response = await uploadRoute(discordApp).handler(
      new Request("https://brain.test/api/webhooks/chat/discord/uploads"),
    );
    expect(response.status).toBe(400);
    expect(await response.text()).toBe("Missing upload id");
  });

  it("returns 404 when the upload store cannot read the ref", async () => {
    const { discordApp } = makeApp({
      uploadStore: createUploadStore(
        mock(async () => {
          throw new Error("not found");
        }) as never,
      ),
    });
    const response = await uploadRoute(discordApp).handler(
      new Request("https://brain.test/api/webhooks/chat/discord/uploads?id=u1"),
    );
    expect(response.status).toBe(404);
    expect(await response.text()).toBe("Upload not found");
  });

  it("returns 404 when the upload store is unavailable", async () => {
    const { discordApp } = makeApp({ uploadStore: undefined });
    const response = await uploadRoute(discordApp).handler(
      new Request("https://brain.test/api/webhooks/chat/discord/uploads?id=u1"),
    );
    expect(response.status).toBe(404);
    expect(await response.text()).toBe("Upload not found");
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
    expect((caught as Error).message).toBe("Chat SDK app not initialized");
  });
});
