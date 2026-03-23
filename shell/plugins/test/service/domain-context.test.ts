import { describe, it, expect } from "bun:test";
import { createCorePluginContext } from "../../src/core/context";
import { createMockShell } from "../../src/test/mock-shell";
import { createServicePluginContext } from "../../src/service/context";
import { createSilentLogger } from "@brains/test-utils";

describe("Domain URL context", () => {
  const logger = createSilentLogger();

  describe("CorePluginContext identity.getSiteUrl()", () => {
    it("should return https URL when domain is set", () => {
      const shell = createMockShell({ logger, domain: "yeehaa.io" });
      const context = createCorePluginContext(shell, "test-plugin");

      expect(context.identity.getSiteUrl()).toBe("https://yeehaa.io");
    });

    it("should return undefined when no domain is set", () => {
      const shell = createMockShell({ logger });
      const context = createCorePluginContext(shell, "test-plugin");

      expect(context.identity.getSiteUrl()).toBeUndefined();
    });

    it("should handle subdomain domains", () => {
      const shell = createMockShell({
        logger,
        domain: "recall.rizom.ai",
      });
      const context = createCorePluginContext(shell, "test-plugin");

      expect(context.identity.getSiteUrl()).toBe("https://recall.rizom.ai");
    });
  });

  describe("CorePluginContext identity.getPreviewUrl()", () => {
    it("should return preview subdomain URL when domain is set", () => {
      const shell = createMockShell({ logger, domain: "yeehaa.io" });
      const context = createCorePluginContext(shell, "test-plugin");

      expect(context.identity.getPreviewUrl()).toBe(
        "https://preview.yeehaa.io",
      );
    });

    it("should return undefined when no domain is set", () => {
      const shell = createMockShell({ logger });
      const context = createCorePluginContext(shell, "test-plugin");

      expect(context.identity.getPreviewUrl()).toBeUndefined();
    });

    it("should handle subdomain domains", () => {
      const shell = createMockShell({
        logger,
        domain: "recall.rizom.ai",
      });
      const context = createCorePluginContext(shell, "test-plugin");

      expect(context.identity.getPreviewUrl()).toBe(
        "https://preview.recall.rizom.ai",
      );
    });
  });

  describe("CorePluginContext identity.getDomain()", () => {
    it("should return the raw domain string", () => {
      const shell = createMockShell({ logger, domain: "yeehaa.io" });
      const context = createCorePluginContext(shell, "test-plugin");

      expect(context.identity.getDomain()).toBe("yeehaa.io");
    });

    it("should return undefined when no domain is set", () => {
      const shell = createMockShell({ logger });
      const context = createCorePluginContext(shell, "test-plugin");

      expect(context.identity.getDomain()).toBeUndefined();
    });
  });

  describe("ServicePluginContext inherits domain methods", () => {
    it("should expose getSiteUrl via service context", () => {
      const shell = createMockShell({ logger, domain: "yeehaa.io" });
      const context = createServicePluginContext(shell, "test-plugin");

      expect(context.identity.getSiteUrl()).toBe("https://yeehaa.io");
    });

    it("should expose getPreviewUrl via service context", () => {
      const shell = createMockShell({ logger, domain: "yeehaa.io" });
      const context = createServicePluginContext(shell, "test-plugin");

      expect(context.identity.getPreviewUrl()).toBe(
        "https://preview.yeehaa.io",
      );
    });

    it("should expose getDomain via service context", () => {
      const shell = createMockShell({ logger, domain: "yeehaa.io" });
      const context = createServicePluginContext(shell, "test-plugin");

      expect(context.identity.getDomain()).toBe("yeehaa.io");
    });
  });
});
