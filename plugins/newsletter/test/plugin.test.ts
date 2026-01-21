import { describe, it, expect, beforeEach } from "bun:test";
import type { Plugin } from "@brains/plugins";
import { createNewsletterPlugin } from "../src";

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
});
