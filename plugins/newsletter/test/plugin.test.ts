import { describe, it, expect, beforeEach } from "bun:test";
import type { Plugin } from "@brains/plugins";
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

  describe("Slot Registrations", () => {
    it("should return footer-top slot when buttondown is configured", () => {
      const plugin = new NewsletterPlugin({
        buttondown: {
          apiKey: "test-api-key",
          doubleOptIn: true,
        },
      });

      const slots = plugin.getSlotRegistrations();

      expect(slots).toHaveLength(1);
      expect(slots[0]).toMatchObject({
        slotName: "footer-top",
        pluginId: "newsletter",
      });
      expect(typeof slots[0]?.render).toBe("function");
    });

    it("should have render function that returns a VNode", () => {
      const plugin = new NewsletterPlugin({
        buttondown: {
          apiKey: "test-api-key",
          doubleOptIn: true,
        },
      });

      const slots = plugin.getSlotRegistrations();
      const vnode = slots[0]?.render();

      expect(vnode).toBeDefined();
      expect(vnode?.type).toBeDefined();
    });

    it("should return empty array when buttondown is not configured", () => {
      const plugin = new NewsletterPlugin({});

      const slots = plugin.getSlotRegistrations();

      expect(slots).toHaveLength(0);
    });
  });
});
