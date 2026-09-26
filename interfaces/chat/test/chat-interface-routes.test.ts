import { describe, it, expect } from "bun:test";
import { writeFile } from "fs/promises";
import { join } from "path";
import type { Plugin, WebRouteDefinition } from "@brains/plugins";
import {
  MockChatSdk,
  createPlugin,
  createSlackPlugin,
  platformUploadStore,
  setupChatInterfaceTest,
} from "./harness/chat-interface-harness";

function routeOf(
  plugin: Plugin,
  path: string,
  method = "POST",
): WebRouteDefinition {
  const route = (plugin.getWebRoutes?.() ?? []).find(
    (candidate) => candidate.path === path && candidate.method === method,
  );
  if (!route) throw new Error(`Route ${method} ${path} was not declared`);
  return route;
}

function hasRoute(plugin: Plugin, path: string): boolean {
  return (plugin.getWebRoutes?.() ?? []).some(
    (candidate) => candidate.path === path,
  );
}

describe("chat webhook and upload routes", () => {
  const suite = setupChatInterfaceTest();

  it("delegates the Discord webhook to the Chat SDK", async () => {
    const plugin = createPlugin();
    await suite.harness.installPlugin(plugin);

    const response = await routeOf(
      plugin,
      "/api/webhooks/chat/discord",
    ).handler(new Request("https://brain.test/hook"));

    expect(response.status).toBe(200);
    expect(await response.text()).toBe("webhook ok");
    expect(MockChatSdk.instances[0]?.webhooks.discord).toHaveBeenCalled();
  });

  it("delegates the Slack webhook to the Chat SDK", async () => {
    const plugin = createSlackPlugin();
    await suite.harness.installPlugin(plugin);

    const response = await routeOf(plugin, "/api/webhooks/chat/slack").handler(
      new Request("https://brain.test/slack-hook"),
    );

    expect(response.status).toBe(200);
    expect(await response.text()).toBe("slack webhook ok");
    expect(MockChatSdk.instances[0]?.webhooks.slack).toHaveBeenCalled();
  });

  it("declares only its own platform's routes", async () => {
    // An unconfigured platform is not an interface at all, so there is no
    // route to 404 on: a Slack-only brain serves no Discord webhook.
    const discord = createPlugin();
    const slack = createSlackPlugin();
    await suite.harness.installPlugin(discord);
    await suite.harness.installPlugin(slack);

    expect(hasRoute(discord, "/api/webhooks/chat/slack")).toBe(false);
    expect(hasRoute(discord, "/api/webhooks/chat/slack/uploads")).toBe(false);
    expect(hasRoute(slack, "/api/webhooks/chat/discord")).toBe(false);
    expect(hasRoute(slack, "/api/webhooks/chat/discord/uploads")).toBe(false);
  });

  it("serves only Slack-scoped uploads from the Slack upload route", async () => {
    const plugin = createSlackPlugin();
    await suite.harness.installPlugin(plugin);
    const slackRecord = await platformUploadStore(suite.harness, "slack").save({
      filename: "slack.txt",
      mediaType: "text/plain",
      content: Buffer.from("slack source"),
    });
    const discordRecord = await platformUploadStore(
      suite.harness,
      "discord",
    ).save({
      filename: "discord.txt",
      mediaType: "text/plain",
      content: Buffer.from("discord source"),
    });
    const route = routeOf(plugin, "/api/webhooks/chat/slack/uploads", "GET");

    const found = await route.handler(
      new Request(
        `https://brain.test/api/webhooks/chat/slack/uploads?id=${slackRecord.id}`,
      ),
    );
    const wrongScope = await route.handler(
      new Request(
        `https://brain.test/api/webhooks/chat/slack/uploads?id=${discordRecord.id}`,
      ),
    );

    expect(found.status).toBe(200);
    expect(found.headers.get("Cache-Control")).toBe("private, no-store");
    expect(await found.text()).toBe("slack source");
    expect(wrongScope.status).toBe(404);
  });

  it("serves stored Discord upload refs through the upload route", async () => {
    const plugin = createPlugin();
    await suite.harness.installPlugin(plugin);
    const record = await platformUploadStore(suite.harness, "discord").save({
      filename: 'déck "draft".pdf',
      mediaType: "application/pdf",
      content: Buffer.from("%PDF-1.7"),
    });
    const route = routeOf(plugin, "/api/webhooks/chat/discord/uploads", "GET");

    const inlineResponse = await route.handler(
      new Request(
        `https://brain.test/api/webhooks/chat/discord/uploads?id=${record.id}`,
      ),
    );
    const downloadResponse = await route.handler(
      new Request(
        `https://brain.test/api/webhooks/chat/discord/uploads?id=${record.id}&download=1`,
      ),
    );

    expect(inlineResponse.status).toBe(200);
    expect(inlineResponse.headers.get("Content-Type")).toBe("application/pdf");
    expect(inlineResponse.headers.get("Cache-Control")).toBe(
      "private, no-store",
    );
    expect(inlineResponse.headers.get("X-Content-Type-Options")).toBe(
      "nosniff",
    );
    expect(inlineResponse.headers.get("Content-Disposition")).toBe(
      "inline; filename=\"d_ck _draft_.pdf\"; filename*=UTF-8''d%C3%A9ck%20%22draft%22.pdf",
    );
    expect(await inlineResponse.text()).toBe("%PDF-1.7");
    expect(downloadResponse.status).toBe(200);
    expect(downloadResponse.headers.get("Content-Disposition")).toBe(
      "attachment; filename=\"d_ck _draft_.pdf\"; filename*=UTF-8''d%C3%A9ck%20%22draft%22.pdf",
    );
  });

  it("reports unreadable stored metadata as a server fault, not a missing upload", async () => {
    // "Upload not found" sends the caller looking for a problem on their side.
    // Metadata we wrote and can no longer read is a problem on ours.
    const plugin = createPlugin();
    await suite.harness.installPlugin(plugin);
    const uploadStore = platformUploadStore(suite.harness, "discord");
    const record = await uploadStore.save({
      filename: "notes.pdf",
      mediaType: "application/pdf",
      content: Buffer.from("%PDF-1.7"),
    });
    await writeFile(
      join(uploadStore.getUploadDir(record.id), "metadata.json"),
      "{ not valid json",
      "utf8",
    );

    const response = await routeOf(
      plugin,
      "/api/webhooks/chat/discord/uploads",
      "GET",
    ).handler(
      new Request(
        `https://brain.test/api/webhooks/chat/discord/uploads?id=${record.id}`,
      ),
    );

    expect(response.status).toBe(500);
    expect(await response.text()).toBe("Upload could not be read");
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

    const response = await routeOf(
      plugin,
      "/api/webhooks/chat/discord/uploads",
      "GET",
    ).handler(
      new Request(
        `https://brain.test/api/webhooks/chat/discord/uploads?id=${record.id}`,
      ),
    );

    expect(response.status).toBe(404);
    expect(await response.text()).toBe("Upload not found");
  });

  it("rejects missing, malformed, or unknown Discord upload refs", async () => {
    const plugin = createPlugin();
    await suite.harness.installPlugin(plugin);
    const route = routeOf(plugin, "/api/webhooks/chat/discord/uploads", "GET");

    const missing = await route.handler(
      new Request("https://brain.test/api/webhooks/chat/discord/uploads"),
    );
    const malformed = await route.handler(
      new Request(
        "https://brain.test/api/webhooks/chat/discord/uploads?id=../secret",
      ),
    );
    const unknown = await route.handler(
      new Request(
        "https://brain.test/api/webhooks/chat/discord/uploads?id=upload-00000000-0000-4000-8000-000000000000",
      ),
    );

    expect(missing.status).toBe(400);
    expect(await missing.text()).toBe("Missing upload id");
    expect(malformed.status).toBe(404);
    expect(await malformed.text()).toBe("Upload not found");
    expect(unknown.status).toBe(404);
    expect(await unknown.text()).toBe("Upload not found");
  });
});
