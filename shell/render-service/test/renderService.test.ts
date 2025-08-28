import { describe, expect, test, beforeEach } from "bun:test";
import { RenderService } from "../src";
import { TemplateRegistry } from "@brains/templates";
import type { Template } from "@brains/templates";
import { z } from "zod";

// Test schemas
const testSchema = z.object({
  title: z.string(),
  content: z.string(),
});

// Test template
const testTemplate: Template = {
  name: "test-plugin:test-template",
  description: "Test template",
  schema: testSchema,
  requiredPermission: "public",
  layout: {
    component: () => "Test component",
    interactive: false,
  },
};

describe("RenderService", () => {
  let renderService: RenderService;
  let templateRegistry: TemplateRegistry;

  beforeEach(() => {
    RenderService.resetInstance();
    TemplateRegistry.resetInstance();
    templateRegistry = TemplateRegistry.createFresh();
    renderService = RenderService.createFresh(templateRegistry);
  });

  test("should retrieve templates with layout components", () => {
    // Register template in central registry
    templateRegistry.register(testTemplate.name, testTemplate);

    const retrieved = renderService.get("test-plugin:test-template");
    expect(retrieved).toBeDefined();
    expect(retrieved?.name).toBe("test-plugin:test-template");
    expect(retrieved?.pluginId).toBe("test-plugin");
    expect(retrieved?.renderers.web).toBeDefined();
  });

  test("should not return templates without layout components", () => {
    const templateWithoutLayout: Template = {
      name: "no-layout:template",
      description: "Template without layout",
      schema: testSchema,
      requiredPermission: "public",
    };

    templateRegistry.register(
      templateWithoutLayout.name,
      templateWithoutLayout,
    );

    const retrieved = renderService.get("no-layout:template");
    expect(retrieved).toBeUndefined();
  });

  test("should list only templates with layout components", () => {
    const templateWithoutLayout: Template = {
      name: "no-layout:template",
      description: "Template without layout",
      schema: testSchema,
      requiredPermission: "public",
    };

    templateRegistry.register(testTemplate.name, testTemplate);
    templateRegistry.register(
      templateWithoutLayout.name,
      templateWithoutLayout,
    );

    const templates = renderService.list();
    expect(templates).toHaveLength(1);
    expect(templates[0]?.name).toBe("test-plugin:test-template");
  });

  test("should validate template content", () => {
    templateRegistry.register(testTemplate.name, testTemplate);

    const validContent = { title: "Test", content: "Content" };
    const invalidContent = { title: "Test" }; // missing content

    expect(
      renderService.validate("test-plugin:test-template", validContent),
    ).toBe(true);
    expect(
      renderService.validate("test-plugin:test-template", invalidContent),
    ).toBe(false);
  });

  test("should find templates by filter", () => {
    templateRegistry.register(testTemplate.name, testTemplate);

    const foundTemplate = renderService.findViewTemplate({
      pluginId: "test-plugin",
    });
    expect(foundTemplate?.name).toBe("test-plugin:test-template");

    const foundByPattern = renderService.findViewTemplate({
      namePattern: ".*test-template$",
    });
    expect(foundByPattern?.name).toBe("test-plugin:test-template");
  });

  test("should handle renderer access", () => {
    templateRegistry.register(testTemplate.name, testTemplate);

    const renderer = renderService.getRenderer(
      "test-plugin:test-template",
      "web",
    );
    expect(renderer).toBeDefined();

    const hasRenderer = renderService.hasRenderer(
      "test-plugin:test-template",
      "web",
    );
    expect(hasRenderer).toBe(true);

    const formats = renderService.listFormats("test-plugin:test-template");
    expect(formats).toContain("web");
  });
});
