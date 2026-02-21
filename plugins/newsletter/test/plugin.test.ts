import { describe, it, expect, beforeEach } from "bun:test";
import type { Plugin, MessageWithPayload } from "@brains/plugins";
import { createPluginHarness } from "@brains/plugins/test";
import { createNewsletterPlugin, NewsletterPlugin } from "../src";

describe("NewsletterPlugin", () => {
  let plugin: Plugin;

  beforeEach(() => {
    plugin = createNewsletterPlugin({
      buttondown: {
        apiKey: "test-api-key",
        doubleOptIn: true,
      },
    });
  });

  describe("Plugin Configuration", () => {
    it("should have correct plugin metadata", () => {
      expect(plugin.id).toBe("newsletter");
      expect(plugin.description).toContain("newsletter");
      expect(plugin.version).toBe("0.1.0");
    });

    it("should use default configuration when not provided", () => {
      const defaultPlugin = createNewsletterPlugin();
      expect(defaultPlugin.id).toBe("newsletter");
    });

    it("should accept buttondown configuration", () => {
      const customPlugin = createNewsletterPlugin({
        buttondown: {
          apiKey: "custom-key",
          doubleOptIn: false,
        },
      });
      expect(customPlugin.id).toBe("newsletter");
    });
  });

  describe("API Routes", () => {
    it("should return subscribe route when buttondown is configured", () => {
      const plugin = new NewsletterPlugin({
        buttondown: {
          apiKey: "test-api-key",
          doubleOptIn: true,
        },
      });

      const routes = plugin.getApiRoutes();

      expect(routes).toHaveLength(1);
      expect(routes[0]).toMatchObject({
        path: "/subscribe",
        method: "POST",
        tool: "subscribe",
        public: true,
        successRedirect: "/subscribe/thanks",
        errorRedirect: "/subscribe/error",
      });
    });

    it("should return empty array when buttondown is not configured", () => {
      const plugin = new NewsletterPlugin({});

      const routes = plugin.getApiRoutes();

      expect(routes).toHaveLength(0);
    });

    it("should return empty array when buttondown apiKey is missing", () => {
      const plugin = new NewsletterPlugin({
        buttondown: {
          apiKey: "",
          doubleOptIn: true,
        },
      });

      const routes = plugin.getApiRoutes();

      expect(routes).toHaveLength(0);
    });
  });

  describe("Slot Registration Messaging", () => {
    interface SlotRegistrationPayload {
      pluginId: string;
      slotName: string;
      render: () => unknown;
      priority?: number;
    }

    it("should send slot registration message on system:plugins:ready when buttondown is configured", async () => {
      const harness = createPluginHarness<NewsletterPlugin>();
      let receivedPayload: SlotRegistrationPayload | undefined;

      // Subscribe before installing plugin
      harness.subscribe<SlotRegistrationPayload>(
        "plugin:site-builder:slot:register",
        (msg: MessageWithPayload<SlotRegistrationPayload>) => {
          receivedPayload = msg.payload;
          return { success: true };
        },
      );

      const plugin = new NewsletterPlugin({
        buttondown: {
          apiKey: "test-api-key",
          doubleOptIn: true,
        },
      });

      await harness.installPlugin(plugin);

      // Slot registration should NOT have happened yet
      expect(receivedPayload).toBeUndefined();

      // Emit system:plugins:ready to trigger slot registration
      await harness.sendMessage("system:plugins:ready", {
        timestamp: new Date().toISOString(),
        pluginCount: 1,
      });

      expect(receivedPayload).toBeDefined();
      expect(receivedPayload).toMatchObject({
        pluginId: "newsletter",
        slotName: "footer-top",
      });
      expect(typeof receivedPayload?.render).toBe("function");

      harness.reset();
    });

    it("should have render function that returns a VNode", async () => {
      const harness = createPluginHarness<NewsletterPlugin>();
      let receivedPayload: SlotRegistrationPayload | undefined;

      harness.subscribe<SlotRegistrationPayload>(
        "plugin:site-builder:slot:register",
        (msg: MessageWithPayload<SlotRegistrationPayload>) => {
          receivedPayload = msg.payload;
          return { success: true };
        },
      );

      const plugin = new NewsletterPlugin({
        buttondown: {
          apiKey: "test-api-key",
          doubleOptIn: true,
        },
      });

      await harness.installPlugin(plugin);

      // Emit system:plugins:ready to trigger slot registration
      await harness.sendMessage("system:plugins:ready", {
        timestamp: new Date().toISOString(),
        pluginCount: 1,
      });

      const vnode = receivedPayload?.render() as { type?: unknown } | undefined;

      expect(vnode).toBeDefined();
      expect(vnode?.type).toBeDefined();

      harness.reset();
    });

    it("should not send slot registration when buttondown is not configured", async () => {
      const harness = createPluginHarness<NewsletterPlugin>();
      let messageReceived = false;

      harness.subscribe("plugin:site-builder:slot:register", () => {
        messageReceived = true;
        return { success: true };
      });

      const plugin = new NewsletterPlugin({});

      await harness.installPlugin(plugin);

      // Emit system:plugins:ready
      await harness.sendMessage("system:plugins:ready", {
        timestamp: new Date().toISOString(),
        pluginCount: 1,
      });

      expect(messageReceived).toBe(false);

      harness.reset();
    });
  });
});
