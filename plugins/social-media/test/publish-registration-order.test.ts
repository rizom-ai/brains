import { describe, it, expect, beforeEach, afterEach, mock } from "bun:test";
import { SocialMediaPlugin } from "../src/plugin";
import { createSilentLogger } from "@brains/test-utils";
import { MockShell } from "@brains/plugins/test";

/**
 * Regression test: publish:register must work regardless of plugin
 * registration order. Previously, if social-media registered before
 * content-pipeline, the publish:register message was dropped because
 * content-pipeline hadn't subscribed yet (MessageBus drops messages
 * with no subscribers).
 *
 * The fix: social-media defers publish:register to system:plugins:ready,
 * so all plugins have subscribed before the message is sent.
 */
describe("publish:register ordering", () => {
  let mockShell: MockShell;
  let logger: ReturnType<typeof createSilentLogger>;

  beforeEach(() => {
    logger = createSilentLogger();
    mockShell = MockShell.createFresh({ logger, dataDir: "/tmp/test-order" });
  });

  afterEach(() => {
    mock.restore();
  });

  it("should deliver publish:register to a late subscriber after system:plugins:ready", async () => {
    // 1. Register social-media (sends publish:register, but should be deferred)
    const socialMediaPlugin = new SocialMediaPlugin({
      linkedin: { accessToken: "test-token" },
    });
    await socialMediaPlugin.register(mockShell);

    // 2. Simulate content-pipeline subscribing AFTER social-media registered
    const received: Array<{ entityType: string; provider: unknown }> = [];
    const messageBus = mockShell.getMessageBus();
    messageBus.subscribe("publish:register", async (msg) => {
      received.push(msg.payload as { entityType: string; provider: unknown });
      return { success: true };
    });

    // 3. Fire system:plugins:ready (shell does this after all plugins register)
    await messageBus.send(
      "system:plugins:ready",
      { timestamp: new Date().toISOString(), pluginCount: 2 },
      "shell",
      undefined,
      undefined,
      true,
    );

    // 4. The late subscriber should have received publish:register
    expect(received.length).toBe(1);
    expect(received[0]?.entityType).toBe("social-post");
    expect(received[0]?.provider).toHaveProperty("name", "linkedin");
  });

  it("should deliver publish:register to an early subscriber after system:plugins:ready", async () => {
    // 1. Simulate content-pipeline subscribing BEFORE social-media
    const received: Array<{ entityType: string; provider: unknown }> = [];
    const messageBus = mockShell.getMessageBus();
    messageBus.subscribe("publish:register", async (msg) => {
      received.push(msg.payload as { entityType: string; provider: unknown });
      return { success: true };
    });

    // 2. Register social-media
    const socialMediaPlugin = new SocialMediaPlugin({
      linkedin: { accessToken: "test-token" },
    });
    await socialMediaPlugin.register(mockShell);

    // 3. Before system:plugins:ready, nothing should have been sent yet
    expect(received.length).toBe(0);

    // 4. Fire system:plugins:ready
    await messageBus.send(
      "system:plugins:ready",
      { timestamp: new Date().toISOString(), pluginCount: 2 },
      "shell",
      undefined,
      undefined,
      true,
    );

    // 5. Now it should be delivered
    expect(received.length).toBe(1);
    expect(received[0]?.entityType).toBe("social-post");
  });

  it("should not send publish:register when no providers are configured", async () => {
    const received: Array<unknown> = [];
    const messageBus = mockShell.getMessageBus();
    messageBus.subscribe("publish:register", async (msg) => {
      received.push(msg.payload);
      return { success: true };
    });

    const socialMediaPlugin = new SocialMediaPlugin({});
    await socialMediaPlugin.register(mockShell);

    await messageBus.send(
      "system:plugins:ready",
      { timestamp: new Date().toISOString(), pluginCount: 1 },
      "shell",
      undefined,
      undefined,
      true,
    );

    expect(received.length).toBe(0);
  });
});
