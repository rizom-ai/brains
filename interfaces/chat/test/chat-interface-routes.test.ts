import { describe, it, expect } from "bun:test";
import {
  createDiscordChatUploadStoreScope,
  createSlackChatUploadStoreScope,
} from "../src/upload-store";
import {
  ChatInterface,
  MockChatSdk,
  baseSlackConfig,
  createPlugin,
  setupChatInterfaceTest,
} from "./harness/chat-interface-harness";

describe("ChatInterface webhook and upload routes", () => {
  const suite = setupChatInterfaceTest();

  it("delegates Discord webhook routes to Chat SDK", async () => {
    const plugin = createPlugin();
    await suite.harness.installPlugin(plugin);
    const route = plugin
      .getWebRoutes()
      .find((candidate) => candidate.path === "/api/webhooks/chat/discord");

    const response = await route?.handler(
      new Request("https://brain.test/hook"),
    );

    expect(response?.status).toBe(200);
    expect(await response?.text()).toBe("webhook ok");
    expect(MockChatSdk.instances[0]?.webhooks.discord).toHaveBeenCalled();
  });

  it("delegates configured Slack webhooks to Chat SDK", async () => {
    const plugin = new ChatInterface({ adapters: { slack: baseSlackConfig } });
    await suite.harness.installPlugin(plugin);
    const route = plugin
      .getWebRoutes()
      .find((candidate) => candidate.path === "/api/webhooks/chat/slack");

    const response = await route?.handler(
      new Request("https://brain.test/slack-hook"),
    );

    expect(response?.status).toBe(200);
    expect(await response?.text()).toBe("slack webhook ok");
    expect(MockChatSdk.instances[0]?.webhooks.slack).toHaveBeenCalled();
  });

  it("returns 404 from Slack webhook route when Slack is not configured", async () => {
    const plugin = createPlugin();
    await suite.harness.installPlugin(plugin);
    const route = plugin
      .getWebRoutes()
      .find((candidate) => candidate.path === "/api/webhooks/chat/slack");

    const response = await route?.handler(
      new Request("https://brain.test/slack-hook"),
    );

    expect(response?.status).toBe(404);
    expect(await response?.text()).toBe("Slack chat webhook not configured");
  });

  it("returns 404 from Discord webhook route when no Discord adapter is configured", async () => {
    const plugin = new ChatInterface({ adapters: { slack: baseSlackConfig } });
    await suite.harness.installPlugin(plugin);
    const route = plugin
      .getWebRoutes()
      .find((candidate) => candidate.path === "/api/webhooks/chat/discord");

    const response = await route?.handler(
      new Request("https://brain.test/hook"),
    );

    expect(response?.status).toBe(404);
    expect(await response?.text()).toBe("Discord chat webhook not configured");
  });

  it("serves only Slack-scoped uploads from the Slack upload route", async () => {
    const plugin = new ChatInterface({ adapters: { slack: baseSlackConfig } });
    await suite.harness.installPlugin(plugin);
    const slackStore = suite.harness
      .getMockShell()
      .getRuntimeUploadRegistry()
      .scoped(createSlackChatUploadStoreScope());
    const discordStore = suite.harness
      .getMockShell()
      .getRuntimeUploadRegistry()
      .scoped(createDiscordChatUploadStoreScope());
    const slackRecord = await slackStore.save({
      filename: "slack.txt",
      mediaType: "text/plain",
      content: Buffer.from("slack source"),
    });
    const discordRecord = await discordStore.save({
      filename: "discord.txt",
      mediaType: "text/plain",
      content: Buffer.from("discord source"),
    });
    const route = plugin
      .getWebRoutes()
      .find(
        (candidate) =>
          candidate.path === "/api/webhooks/chat/slack/uploads" &&
          candidate.method === "GET",
      );

    const found = await route?.handler(
      new Request(
        `https://brain.test/api/webhooks/chat/slack/uploads?id=${slackRecord.id}`,
      ),
    );
    const wrongScope = await route?.handler(
      new Request(
        `https://brain.test/api/webhooks/chat/slack/uploads?id=${discordRecord.id}`,
      ),
    );

    expect(found?.status).toBe(200);
    expect(found?.headers.get("Cache-Control")).toBe("private, no-store");
    expect(await found?.text()).toBe("slack source");
    expect(wrongScope?.status).toBe(404);
  });

  it("returns 404 from Discord upload route when no Discord adapter is configured", async () => {
    const plugin = new ChatInterface({ adapters: { slack: baseSlackConfig } });
    await suite.harness.installPlugin(plugin);
    const route = plugin
      .getWebRoutes()
      .find(
        (candidate) =>
          candidate.path === "/api/webhooks/chat/discord/uploads" &&
          candidate.method === "GET",
      );

    const response = await route?.handler(
      new Request(
        "https://brain.test/api/webhooks/chat/discord/uploads?id=upload-00000000-0000-4000-8000-000000000000",
      ),
    );

    expect(response?.status).toBe(404);
    expect(await response?.text()).toBe("Discord chat uploads not configured");
  });

  it("serves stored Discord upload refs through the upload route", async () => {
    const plugin = createPlugin();
    await suite.harness.installPlugin(plugin);
    const uploadStore = suite.harness
      .getMockShell()
      .getRuntimeUploadRegistry()
      .scoped(createDiscordChatUploadStoreScope());
    const record = await uploadStore.save({
      filename: 'déck "draft".pdf',
      mediaType: "application/pdf",
      content: Buffer.from("%PDF-1.7"),
    });
    const route = plugin
      .getWebRoutes()
      .find(
        (candidate) =>
          candidate.path === "/api/webhooks/chat/discord/uploads" &&
          candidate.method === "GET",
      );

    const inlineResponse = await route?.handler(
      new Request(
        `https://brain.test/api/webhooks/chat/discord/uploads?id=${record.id}`,
      ),
    );
    const downloadResponse = await route?.handler(
      new Request(
        `https://brain.test/api/webhooks/chat/discord/uploads?id=${record.id}&download=1`,
      ),
    );

    expect(inlineResponse?.status).toBe(200);
    expect(inlineResponse?.headers.get("Content-Type")).toBe("application/pdf");
    expect(inlineResponse?.headers.get("Cache-Control")).toBe(
      "private, no-store",
    );
    expect(inlineResponse?.headers.get("X-Content-Type-Options")).toBe(
      "nosniff",
    );
    expect(inlineResponse?.headers.get("Content-Disposition")).toBe(
      "inline; filename=\"d_ck _draft_.pdf\"; filename*=UTF-8''d%C3%A9ck%20%22draft%22.pdf",
    );
    expect(await inlineResponse?.text()).toBe("%PDF-1.7");
    expect(downloadResponse?.status).toBe(200);
    expect(downloadResponse?.headers.get("Content-Disposition")).toBe(
      "attachment; filename=\"d_ck _draft_.pdf\"; filename*=UTF-8''d%C3%A9ck%20%22draft%22.pdf",
    );
  });

  it("does not serve upload refs from other runtime upload scopes", async () => {
    const plugin = createPlugin();
    await suite.harness.installPlugin(plugin);
    const otherUploadStore = suite.harness
      .getMockShell()
      .getRuntimeUploadRegistry()
      .scoped({
        namespace: "web-chat",
        refKind: "web-chat-upload",
        routePath: "/api/chat/uploads",
      });
    const record = await otherUploadStore.save({
      filename: "private.txt",
      mediaType: "text/plain",
      content: Buffer.from("not a discord source upload"),
    });
    const route = plugin
      .getWebRoutes()
      .find(
        (candidate) =>
          candidate.path === "/api/webhooks/chat/discord/uploads" &&
          candidate.method === "GET",
      );

    const response = await route?.handler(
      new Request(
        `https://brain.test/api/webhooks/chat/discord/uploads?id=${record.id}`,
      ),
    );

    expect(response?.status).toBe(404);
    expect(await response?.text()).toBe("Upload not found");
  });

  it("rejects missing, malformed, or unknown Discord upload refs", async () => {
    const plugin = createPlugin();
    await suite.harness.installPlugin(plugin);
    const route = plugin
      .getWebRoutes()
      .find(
        (candidate) =>
          candidate.path === "/api/webhooks/chat/discord/uploads" &&
          candidate.method === "GET",
      );

    const missing = await route?.handler(
      new Request("https://brain.test/api/webhooks/chat/discord/uploads"),
    );
    const malformed = await route?.handler(
      new Request(
        "https://brain.test/api/webhooks/chat/discord/uploads?id=../secret",
      ),
    );
    const unknown = await route?.handler(
      new Request(
        "https://brain.test/api/webhooks/chat/discord/uploads?id=upload-00000000-0000-4000-8000-000000000000",
      ),
    );

    expect(missing?.status).toBe(400);
    expect(await missing?.text()).toBe("Missing upload id");
    expect(malformed?.status).toBe(404);
    expect(await malformed?.text()).toBe("Upload not found");
    expect(unknown?.status).toBe(404);
    expect(await unknown?.text()).toBe("Upload not found");
  });
});
