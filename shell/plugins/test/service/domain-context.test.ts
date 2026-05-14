import { describe, it, expect } from "bun:test";
import { createBasePluginContext } from "../../src/base/context";
import { createMockShell } from "../../src/test/mock-shell";
import { createServicePluginContext } from "../../src/service/context";
import { createSilentLogger } from "@brains/test-utils";

describe("Top-level context properties", () => {
  const logger = createSilentLogger();

  describe("context.domain", () => {
    it("should return the raw domain string", () => {
      const shell = createMockShell({ logger, domain: "yeehaa.io" });
      const context = createBasePluginContext(shell, "test-plugin");

      expect(context.domain).toBe("yeehaa.io");
    });

    it("should return undefined when no domain is set", () => {
      const shell = createMockShell({ logger });
      const context = createBasePluginContext(shell, "test-plugin");

      expect(context.domain).toBeUndefined();
    });
  });

  describe("context.siteUrl", () => {
    it("should return https URL when domain is set", () => {
      const shell = createMockShell({ logger, domain: "yeehaa.io" });
      const context = createBasePluginContext(shell, "test-plugin");

      expect(context.siteUrl).toBe("https://yeehaa.io");
    });

    it("should return undefined when no domain is set", () => {
      const shell = createMockShell({ logger });
      const context = createBasePluginContext(shell, "test-plugin");

      expect(context.siteUrl).toBeUndefined();
    });

    it("should handle subdomain domains", () => {
      const shell = createMockShell({
        logger,
        domain: "recall.rizom.ai",
      });
      const context = createBasePluginContext(shell, "test-plugin");

      expect(context.siteUrl).toBe("https://recall.rizom.ai");
    });
  });

  describe("context.previewUrl", () => {
    it("should return preview subdomain URL when domain is set", () => {
      const shell = createMockShell({ logger, domain: "yeehaa.io" });
      const context = createBasePluginContext(shell, "test-plugin");

      expect(context.previewUrl).toBe("https://preview.yeehaa.io");
    });

    it("should return undefined when no domain is set", () => {
      const shell = createMockShell({ logger });
      const context = createBasePluginContext(shell, "test-plugin");

      expect(context.previewUrl).toBeUndefined();
    });

    it("should handle subdomain domains", () => {
      const shell = createMockShell({
        logger,
        domain: "recall.rizom.ai",
      });
      const context = createBasePluginContext(shell, "test-plugin");

      expect(context.previewUrl).toBe("https://preview.recall.rizom.ai");
    });
  });

  describe("context.localSiteUrl", () => {
    it("should expose the local runtime site URL", () => {
      const shell = createMockShell({
        logger,
        localSiteUrl: "http://localhost:9090",
      });
      const context = createBasePluginContext(shell, "test-plugin");

      expect(context.localSiteUrl).toBe("http://localhost:9090");
    });

    it("should return undefined when no local runtime site URL is set", () => {
      const shell = createMockShell({ logger });
      const context = createBasePluginContext(shell, "test-plugin");

      expect(context.localSiteUrl).toBeUndefined();
    });
  });

  describe("context.preferLocalUrls", () => {
    it("should expose the local URL preference", () => {
      const shell = createMockShell({
        logger,
        preferLocalUrls: true,
      });
      const context = createBasePluginContext(shell, "test-plugin");

      expect(context.preferLocalUrls).toBe(true);
    });

    it("should default to false", () => {
      const shell = createMockShell({ logger });
      const context = createBasePluginContext(shell, "test-plugin");

      expect(context.preferLocalUrls).toBe(false);
    });
  });

  describe("context.spaces", () => {
    it("should expose configured shared conversation spaces", () => {
      const shell = createMockShell({
        logger,
        spaces: ["discord:project-*", "mcp:weekly-sync"],
      });
      const context = createBasePluginContext(shell, "test-plugin");

      expect(context.spaces).toEqual(["discord:project-*", "mcp:weekly-sync"]);
    });

    it("should default to an empty list", () => {
      const shell = createMockShell({ logger });
      const context = createBasePluginContext(shell, "test-plugin");

      expect(context.spaces).toEqual([]);
    });
  });

  describe("context.appInfo", () => {
    it("should return app metadata", async () => {
      const shell = createMockShell({ logger });
      const context = createBasePluginContext(shell, "test-plugin");

      const info = await context.appInfo();
      expect(info.model).toBe("test-brain");
      expect(info.version).toBe("1.0.0");
      expect(typeof info.uptime).toBe("number");
    });
  });

  describe("ServicePluginContext inherits top-level properties", () => {
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

    it("should expose localSiteUrl and preferLocalUrls via service context", () => {
      const shell = createMockShell({
        logger,
        localSiteUrl: "http://localhost:8080",
        preferLocalUrls: true,
      });
      const context = createServicePluginContext(shell, "test-plugin");

      expect(context.localSiteUrl).toBe("http://localhost:8080");
      expect(context.preferLocalUrls).toBe(true);
    });

    it("should expose appInfo via service context", async () => {
      const shell = createMockShell({ logger });
      const context = createServicePluginContext(shell, "test-plugin");

      const info = await context.appInfo();
      expect(info.model).toBeDefined();
    });
  });
});
