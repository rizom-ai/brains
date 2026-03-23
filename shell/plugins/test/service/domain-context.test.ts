import { describe, it, expect } from "bun:test";
import { createCorePluginContext } from "../../src/core/context";
import { createMockShell } from "../../src/test/mock-shell";
import { createServicePluginContext } from "../../src/service/context";
import { createSilentLogger } from "@brains/test-utils";

describe("Domain URL context", () => {
  const logger = createSilentLogger();

  describe("context.domain", () => {
    it("should return the raw domain string", () => {
      const shell = createMockShell({ logger, domain: "yeehaa.io" });
      const context = createCorePluginContext(shell, "test-plugin");

      expect(context.domain).toBe("yeehaa.io");
    });

    it("should return undefined when no domain is set", () => {
      const shell = createMockShell({ logger });
      const context = createCorePluginContext(shell, "test-plugin");

      expect(context.domain).toBeUndefined();
    });
  });

  describe("context.siteUrl", () => {
    it("should return https URL when domain is set", () => {
      const shell = createMockShell({ logger, domain: "yeehaa.io" });
      const context = createCorePluginContext(shell, "test-plugin");

      expect(context.siteUrl).toBe("https://yeehaa.io");
    });

    it("should return undefined when no domain is set", () => {
      const shell = createMockShell({ logger });
      const context = createCorePluginContext(shell, "test-plugin");

      expect(context.siteUrl).toBeUndefined();
    });

    it("should handle subdomain domains", () => {
      const shell = createMockShell({
        logger,
        domain: "recall.rizom.ai",
      });
      const context = createCorePluginContext(shell, "test-plugin");

      expect(context.siteUrl).toBe("https://recall.rizom.ai");
    });
  });

  describe("context.previewUrl", () => {
    it("should return preview subdomain URL when domain is set", () => {
      const shell = createMockShell({ logger, domain: "yeehaa.io" });
      const context = createCorePluginContext(shell, "test-plugin");

      expect(context.previewUrl).toBe("https://preview.yeehaa.io");
    });

    it("should return undefined when no domain is set", () => {
      const shell = createMockShell({ logger });
      const context = createCorePluginContext(shell, "test-plugin");

      expect(context.previewUrl).toBeUndefined();
    });

    it("should handle subdomain domains", () => {
      const shell = createMockShell({
        logger,
        domain: "recall.rizom.ai",
      });
      const context = createCorePluginContext(shell, "test-plugin");

      expect(context.previewUrl).toBe("https://preview.recall.rizom.ai");
    });
  });

  describe("ServicePluginContext inherits domain properties", () => {
    it("should expose domain via service context", () => {
      const shell = createMockShell({ logger, domain: "yeehaa.io" });
      const context = createServicePluginContext(shell, "test-plugin");

      expect(context.domain).toBe("yeehaa.io");
    });

    it("should expose siteUrl via service context", () => {
      const shell = createMockShell({ logger, domain: "yeehaa.io" });
      const context = createServicePluginContext(shell, "test-plugin");

      expect(context.siteUrl).toBe("https://yeehaa.io");
    });

    it("should expose previewUrl via service context", () => {
      const shell = createMockShell({ logger, domain: "yeehaa.io" });
      const context = createServicePluginContext(shell, "test-plugin");

      expect(context.previewUrl).toBe("https://preview.yeehaa.io");
    });
  });
});
