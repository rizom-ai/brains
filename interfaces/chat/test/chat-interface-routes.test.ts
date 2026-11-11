import { describe, it, expect } from "bun:test";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createPluginHarness } from "@brains/plugins/test";
import {
  createChatPlugin,
  MockChatSdk,
  baseDiscordConfig,
  baseSlackConfig,
  createPlugin,
  setupChatInterfaceTest,
  type ChatInterfaceInstance,
} from "./harness/chat-interface-harness";

describe("ChatInterface webhook routes", () => {
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
    const plugin = createChatPlugin({ adapters: { slack: baseSlackConfig } });
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
    const plugin = createChatPlugin({ adapters: { slack: baseSlackConfig } });
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

  it("serves no platform upload route: the old upload URLs are not routed", async () => {
    const plugin = createChatPlugin({
      adapters: {
        discord: baseDiscordConfig,
        slack: baseSlackConfig,
      },
    });
    await suite.harness.installPlugin(plugin);

    expect(
      plugin.getWebRoutes().map(({ method, path }) => `${method} ${path}`),
    ).toEqual([
      "POST /api/webhooks/chat/discord",
      "POST /api/webhooks/chat/slack",
    ]);
  });
});

describe("ChatInterface retired platform uploads", () => {
  const suite = setupChatInterfaceTest();

  async function dataDirWithRetiredUploads(): Promise<string> {
    const dataDir = await mkdtemp(join(tmpdir(), "brains-chat-retired-"));
    for (const namespace of ["discord-chat", "slack-chat"]) {
      await mkdir(join(dataDir, namespace, "uploads", "upload-old"), {
        recursive: true,
      });
      await writeFile(
        join(dataDir, namespace, "uploads", "upload-old", "content"),
        "expired",
      );
    }
    await mkdir(join(dataDir, "upload", "uploads", "upload-kept"), {
      recursive: true,
    });
    await writeFile(join(dataDir, "discord-chat", "keep.txt"), "keep");
    return dataDir;
  }

  it("deletes both platform upload directories at startup, touching nothing else", async () => {
    const dataDir = await dataDirWithRetiredUploads();
    try {
      const harness = createPluginHarness<ChatInterfaceInstance>({ dataDir });
      harness.setAgentService(suite.agentService);
      await harness.installPlugin(
        createChatPlugin({ adapters: { slack: baseSlackConfig } }),
      );

      expect(existsSync(join(dataDir, "discord-chat", "uploads"))).toBe(false);
      expect(existsSync(join(dataDir, "slack-chat", "uploads"))).toBe(false);
      expect(existsSync(join(dataDir, "discord-chat", "keep.txt"))).toBe(true);
      expect(
        existsSync(join(dataDir, "upload", "uploads", "upload-kept")),
      ).toBe(true);

      // A second start finds nothing to delete and changes nothing.
      const restarted = createPluginHarness<ChatInterfaceInstance>({ dataDir });
      restarted.setAgentService(suite.agentService);
      await restarted.installPlugin(
        createChatPlugin({ adapters: { slack: baseSlackConfig } }),
      );
      expect(existsSync(join(dataDir, "discord-chat", "keep.txt"))).toBe(true);
      expect(
        existsSync(join(dataDir, "upload", "uploads", "upload-kept")),
      ).toBe(true);
      await harness.reset();
      await restarted.reset();
    } finally {
      await rm(dataDir, { recursive: true, force: true });
    }
  });
});
