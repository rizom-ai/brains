import { describe, it, expect, beforeEach, spyOn } from "bun:test";
import { TemplateRegistry } from "../src/registry";
import { createTemplate } from "../src/types";
import { z } from "zod";
import { h } from "preact";
import { createSilentLogger } from "@brains/utils";

describe("TemplateRegistry", () => {
  let registry: TemplateRegistry;

  beforeEach(() => {
    registry = TemplateRegistry.createFresh();
  });

  describe("basic operations", () => {
    it("should register and retrieve templates", () => {
      const template = createTemplate({
        name: "test",
        description: "Test template",
        schema: z.object({ title: z.string() }),
        requiredPermission: "public",
      });

      registry.register("test-template", template);

      const retrieved = registry.get("test-template");
      expect(retrieved).toBeDefined();
      expect(retrieved?.name).toBe("test");
    });

    it("should return undefined for non-existent templates", () => {
      const result = registry.get("non-existent");
      expect(result).toBeUndefined();
    });

    it("should check template existence", () => {
      const template = createTemplate({
        name: "test",
        description: "Test template",
        schema: z.object({ title: z.string() }),
        requiredPermission: "public",
      });

      expect(registry.has("test")).toBe(false);
      registry.register("test", template);
      expect(registry.has("test")).toBe(true);
    });
  });

  describe("collection operations", () => {
    beforeEach(() => {
      // Register multiple templates
      const template1 = createTemplate({
        name: "template1",
        description: "First template",
        schema: z.object({ title: z.string() }),
        requiredPermission: "public",
      });

      const template2 = createTemplate({
        name: "template2",
        description: "Second template",
        schema: z.object({ content: z.string() }),
        requiredPermission: "trusted",
      });

      registry.register("plugin1:template1", template1);
      registry.register("plugin2:template2", template2);
    });

    it("should return all templates", () => {
      const all = registry.getAll();
      expect(all.size).toBe(2);
      expect(all.has("plugin1:template1")).toBe(true);
      expect(all.has("plugin2:template2")).toBe(true);
    });

    it("should list all templates as array", () => {
      const list = registry.list();
      expect(list).toHaveLength(2);
      expect(list.some((t) => t.name === "template1")).toBe(true);
      expect(list.some((t) => t.name === "template2")).toBe(true);
    });

    it("should return template names", () => {
      const names = registry.getNames();
      expect(names).toHaveLength(2);
      expect(names).toContain("plugin1:template1");
      expect(names).toContain("plugin2:template2");
    });

    it("should return correct size", () => {
      expect(registry.size()).toBe(2);
    });
  });

  describe("plugin-scoped operations", () => {
    beforeEach(() => {
      const template1 = createTemplate({
        name: "template1",
        description: "Plugin 1 template",
        schema: z.object({ title: z.string() }),
        requiredPermission: "public",
      });

      const template2 = createTemplate({
        name: "template2",
        description: "Plugin 1 template 2",
        schema: z.object({ content: z.string() }),
        requiredPermission: "public",
      });

      const template3 = createTemplate({
        name: "template3",
        description: "Plugin 2 template",
        schema: z.object({ data: z.string() }),
        requiredPermission: "public",
      });

      registry.register("plugin1:template1", template1);
      registry.register("plugin1:template2", template2);
      registry.register("plugin2:template3", template3);
    });

    it("should get templates by plugin ID", () => {
      const plugin1Templates = registry.getPluginTemplates("plugin1");
      expect(plugin1Templates).toHaveLength(2);
      expect(plugin1Templates.some((t) => t.name === "template1")).toBe(true);
      expect(plugin1Templates.some((t) => t.name === "template2")).toBe(true);

      const plugin2Templates = registry.getPluginTemplates("plugin2");
      expect(plugin2Templates).toHaveLength(1);
      expect(plugin2Templates[0]?.name).toBe("template3");
    });

    it("should get template names by plugin ID", () => {
      const plugin1Names = registry.getPluginTemplateNames("plugin1");
      expect(plugin1Names).toHaveLength(2);
      expect(plugin1Names).toContain("plugin1:template1");
      expect(plugin1Names).toContain("plugin1:template2");

      const plugin2Names = registry.getPluginTemplateNames("plugin2");
      expect(plugin2Names).toHaveLength(1);
      expect(plugin2Names).toContain("plugin2:template3");
    });

    it("should return empty arrays for non-existent plugins", () => {
      const templates = registry.getPluginTemplates("non-existent");
      expect(templates).toHaveLength(0);

      const names = registry.getPluginTemplateNames("non-existent");
      expect(names).toHaveLength(0);
    });
  });

  describe("template modification", () => {
    it("should unregister templates", () => {
      const template = createTemplate({
        name: "test",
        description: "Test template",
        schema: z.object({ title: z.string() }),
        requiredPermission: "public",
      });

      registry.register("test", template);
      expect(registry.has("test")).toBe(true);

      const removed = registry.unregister("test");
      expect(removed).toBe(true);
      expect(registry.has("test")).toBe(false);
    });

    it("should return false when unregistering non-existent template", () => {
      const removed = registry.unregister("non-existent");
      expect(removed).toBe(false);
    });

    it("should clear all templates", () => {
      const template1 = createTemplate({
        name: "template1",
        description: "First template",
        schema: z.object({ title: z.string() }),
        requiredPermission: "public",
      });

      const template2 = createTemplate({
        name: "template2",
        description: "Second template",
        schema: z.object({ content: z.string() }),
        requiredPermission: "public",
      });

      registry.register("template1", template1);
      registry.register("template2", template2);
      expect(registry.size()).toBe(2);

      registry.clear();
      expect(registry.size()).toBe(0);
      expect(registry.has("template1")).toBe(false);
      expect(registry.has("template2")).toBe(false);
    });
  });

  describe("complex templates", () => {
    it("should handle templates with layout components", () => {
      const templateWithLayout = createTemplate({
        name: "complex",
        description: "Complex template with layout",
        schema: z.object({ title: z.string(), content: z.string() }),
        requiredPermission: "public",
        layout: {
          component: ({ title, content }: { title: string; content: string }) =>
            h("div", {}, h("h1", {}, title), h("p", {}, content)),
          interactive: true,
        },
      });

      registry.register("complex-template", templateWithLayout);

      const retrieved = registry.get("complex-template");
      expect(retrieved).toBeDefined();
      expect(retrieved?.layout).toBeDefined();
      expect(retrieved?.layout?.component).toBeDefined();
      expect(retrieved?.layout?.interactive).toBe(true);
    });

    it("should handle templates with formatters", () => {
      const templateWithFormatter = createTemplate({
        name: "formatted",
        description: "Template with formatter",
        schema: z.object({ data: z.string() }),
        requiredPermission: "public",
        formatter: {
          format: (data: unknown) => JSON.stringify(data),
          parse: (content: string) => JSON.parse(content),
        },
      });

      registry.register("formatted-template", templateWithFormatter);

      const retrieved = registry.get("formatted-template");
      expect(retrieved).toBeDefined();
      expect(retrieved?.formatter).toBeDefined();
      expect(retrieved?.formatter?.format).toBeDefined();
      expect(retrieved?.formatter?.parse).toBeDefined();
    });

    it("should handle templates with provider IDs", () => {
      const providerTemplate = createTemplate({
        name: "provider",
        description: "Template with provider",
        schema: z.object({
          stats: z.array(z.object({ type: z.string(), count: z.number() })),
        }),
        requiredPermission: "public",
        dataSourceId: "system-stats",
      });

      registry.register("provider-template", providerTemplate);

      const retrieved = registry.get("provider-template");
      expect(retrieved).toBeDefined();
      expect(retrieved?.dataSourceId).toBe("system-stats");
    });
  });

  describe("capability validation", () => {
    it("should log error for basePrompt without AI dataSource", () => {
      const logger = createSilentLogger();
      const errorSpy = spyOn(logger, "error");

      const registryWithLogger = TemplateRegistry.createFresh(logger);

      const template = createTemplate({
        name: "test",
        description: "Test template",
        schema: z.string(),
        basePrompt: "Generate content",
        dataSourceId: "shell:system-stats", // Wrong dataSource
        requiredPermission: "public",
      });

      registryWithLogger.register("test", template);

      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining("Template configuration error:"),
      );
    });

    it("should log error for AI dataSource without basePrompt", () => {
      const logger = createSilentLogger();
      const errorSpy = spyOn(logger, "error");

      const registryWithLogger = TemplateRegistry.createFresh(logger);

      const template = createTemplate({
        name: "test",
        description: "Test template",
        schema: z.string(),
        dataSourceId: "shell:ai-content", // AI dataSource without basePrompt
        requiredPermission: "public",
      });

      registryWithLogger.register("test", template);

      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining("Template configuration error:"),
      );
    });

    it("should not log errors for valid configurations", () => {
      const logger = createSilentLogger();
      const errorSpy = spyOn(logger, "error");

      const registryWithLogger = TemplateRegistry.createFresh(logger);

      // Valid fetch-only template
      const fetchTemplate = createTemplate({
        name: "fetch",
        description: "Fetch template",
        schema: z.string(),
        dataSourceId: "shell:system-stats",
        requiredPermission: "public",
      });

      // Valid AI generation template
      const aiTemplate = createTemplate({
        name: "ai",
        description: "AI template",
        schema: z.string(),
        basePrompt: "Generate content",
        dataSourceId: "shell:ai-content",
        requiredPermission: "public",
      });

      // Valid static template
      const staticTemplate = createTemplate({
        name: "static",
        description: "Static template",
        schema: z.string(),
        requiredPermission: "public",
        layout: {
          component: () => h("div", {}, "Static"),
        },
      });

      registryWithLogger.register("fetch", fetchTemplate);
      registryWithLogger.register("ai", aiTemplate);
      registryWithLogger.register("static", staticTemplate);

      expect(errorSpy).not.toHaveBeenCalled();
    });
  });
});
