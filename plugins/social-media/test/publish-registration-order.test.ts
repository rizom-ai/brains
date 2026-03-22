import { describe, it, expect, beforeEach } from "bun:test";
import { SocialMediaPlugin } from "../src/plugin";
import {
  createPluginHarness,
  type PluginTestHarness,
} from "@brains/plugins/test";

/**
 * Regression test: publish:register must work regardless of plugin
 * registration order. social-media defers publish:register to
 * system:plugins:ready so all plugins have subscribed before the
 * message is sent.
 */
describe("publish:register ordering", () => {
  let harness: PluginTestHarness<SocialMediaPlugin>;

  beforeEach(() => {
    harness = createPluginHarness<SocialMediaPlugin>({
      dataDir: "/tmp/test-order",
    });
  });

  it("should deliver publish:register to a late subscriber after system:plugins:ready", async () => {
    await harness.installPlugin(
      new SocialMediaPlugin({ linkedin: { accessToken: "test-token" } }),
    );

    // Subscribe AFTER plugin registered (late subscriber)
    const received: Array<{ entityType: string; provider: unknown }> = [];
    harness.subscribe("publish:register", async (msg) => {
      received.push(msg.payload as { entityType: string; provider: unknown });
      return { success: true };
    });

    await harness.sendMessage(
      "system:plugins:ready",
      { timestamp: new Date().toISOString(), pluginCount: 2 },
      "shell",
      true,
    );

    expect(received.length).toBe(1);
    expect(received[0]?.entityType).toBe("social-post");
    expect(received[0]?.provider).toHaveProperty("name", "linkedin");
  });

  it("should deliver publish:register to an early subscriber after system:plugins:ready", async () => {
    // Subscribe BEFORE plugin registered (early subscriber)
    const received: Array<{ entityType: string; provider: unknown }> = [];
    harness.subscribe("publish:register", async (msg) => {
      received.push(msg.payload as { entityType: string; provider: unknown });
      return { success: true };
    });

    await harness.installPlugin(
      new SocialMediaPlugin({ linkedin: { accessToken: "test-token" } }),
    );

    expect(received.length).toBe(0);

    await harness.sendMessage(
      "system:plugins:ready",
      { timestamp: new Date().toISOString(), pluginCount: 2 },
      "shell",
      true,
    );

    expect(received.length).toBe(1);
    expect(received[0]?.entityType).toBe("social-post");
  });

  it("should not send publish:register when no providers are configured", async () => {
    const received: Array<unknown> = [];
    harness.subscribe("publish:register", async (msg) => {
      received.push(msg.payload);
      return { success: true };
    });

    await harness.installPlugin(new SocialMediaPlugin({}));

    await harness.sendMessage(
      "system:plugins:ready",
      { timestamp: new Date().toISOString(), pluginCount: 1 },
      "shell",
      true,
    );

    expect(received.length).toBe(0);
  });
});
