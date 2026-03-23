import { describe, expect, it, beforeEach } from "bun:test";
import { SystemPlugin } from "../src/plugin";
import { createPluginHarness } from "@brains/plugins/test";
import { createSilentLogger } from "@brains/test-utils";
import type { PluginResource } from "@brains/plugins";

describe("System Plugin Resources", () => {
  let harness: ReturnType<typeof createPluginHarness>;
  let resources: PluginResource[];

  beforeEach(async () => {
    harness = createPluginHarness({
      logger: createSilentLogger("system-resources-test"),
    });

    const plugin = new SystemPlugin();
    const capabilities = await harness.installPlugin(plugin);
    resources = capabilities.resources;
  });

  describe("registered resources", () => {
    it("should register entity://types resource", () => {
      const resource = resources.find((r) => r.uri === "entity://types");
      expect(resource).toBeDefined();
      expect(resource?.mimeType).toBe("text/plain");
    });

    it("should register brain://identity resource", () => {
      const resource = resources.find((r) => r.uri === "brain://identity");
      expect(resource).toBeDefined();
      expect(resource?.mimeType).toBe("application/json");
    });

    it("should register brain://profile resource", () => {
      const resource = resources.find((r) => r.uri === "brain://profile");
      expect(resource).toBeDefined();
      expect(resource?.mimeType).toBe("application/json");
    });
  });

  describe("entity://types", () => {
    it("should return entity types as newline-separated text", async () => {
      const resource = resources.find((r) => r.uri === "entity://types");
      if (!resource) throw new Error("entity://types not found");

      const result = await resource.handler();
      const content = result.contents[0];
      if (!content) throw new Error("No content returned");
      expect(content.uri).toBe("entity://types");
      expect(content.mimeType).toBe("text/plain");
      expect(typeof content.text).toBe("string");
    });
  });

  describe("brain://identity", () => {
    it("should return brain character as JSON", async () => {
      const resource = resources.find((r) => r.uri === "brain://identity");
      if (!resource) throw new Error("brain://identity not found");

      const result = await resource.handler();
      const content = result.contents[0];
      if (!content) throw new Error("No content returned");
      expect(content.uri).toBe("brain://identity");
      expect(content.mimeType).toBe("application/json");

      const data = JSON.parse(content.text);
      expect(data.name).toBeDefined();
      expect(data.role).toBeDefined();
      expect(data.purpose).toBeDefined();
    });
  });

  describe("brain://profile", () => {
    it("should return anchor profile as JSON", async () => {
      const resource = resources.find((r) => r.uri === "brain://profile");
      if (!resource) throw new Error("brain://profile not found");

      const result = await resource.handler();
      const content = result.contents[0];
      if (!content) throw new Error("No content returned");
      expect(content.uri).toBe("brain://profile");
      expect(content.mimeType).toBe("application/json");

      const data = JSON.parse(content.text);
      expect(data.name).toBeDefined();
    });
  });
});
