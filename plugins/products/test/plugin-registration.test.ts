import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { ProductsPlugin } from "../src/plugin";
import { createPluginHarness } from "@brains/plugins/test";
import type { PluginCapabilities } from "@brains/plugins/test";

describe("ProductsPlugin", () => {
  let harness: ReturnType<typeof createPluginHarness>;
  let plugin: ProductsPlugin;
  let capabilities: PluginCapabilities;

  beforeEach(async () => {
    harness = createPluginHarness({ dataDir: "/tmp/test-products" });

    plugin = new ProductsPlugin();
    capabilities = await harness.installPlugin(plugin);
  });

  afterEach(() => {
    harness.reset();
  });

  describe("Plugin Registration", () => {
    it("should register plugin with correct metadata", () => {
      expect(plugin.id).toBe("products");
      expect(plugin.type).toBe("service");
      expect(plugin.version).toBeDefined();
    });

    it("should register product entity type", () => {
      const entityService = harness.getShell().getEntityService();
      const entityTypes = entityService.getEntityTypes();
      expect(entityTypes).toContain("product");
    });

    it("should register products-overview entity type", () => {
      const entityService = harness.getShell().getEntityService();
      const entityTypes = entityService.getEntityTypes();
      expect(entityTypes).toContain("products-overview");
    });

    it("should register product-list template", () => {
      const templates = harness.getTemplates();
      expect(templates.has("products:product-list")).toBe(true);
    });

    it("should not provide any tools yet", () => {
      expect(capabilities.tools).toEqual([]);
    });

    it("should not provide any resources", () => {
      expect(capabilities.resources).toEqual([]);
    });
  });
});
