import { describe, expect, test, beforeEach } from "bun:test";
import { RenderService } from "../src/render-service";
import {
  InMemoryTemplateRegistry,
  type TemplateRegistry,
} from "../src/registry";
import type { Template } from "../src/types";
import { z } from "@brains/utils/zod";
import { createElement as h } from "react";

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
    component: () => h("span", null, "Test component"),
  },
};

describe("RenderService", () => {
  let renderService: RenderService;
  let templateRegistry: TemplateRegistry;

  beforeEach(() => {
    templateRegistry = InMemoryTemplateRegistry.createFresh();
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

  test("should pass renderer metadata through to the view template", () => {
    const scriptedTemplate: Template = {
      ...testTemplate,
      name: "test-plugin:scripted",
      renderVersion: "map-v2",
      runtimeScripts: [{ src: "/scripts/map.js", defer: true }],
      staticAssets: { "/scripts/map.js": "(function(){/* map */})();" },
    };
    templateRegistry.register(scriptedTemplate.name, scriptedTemplate);

    const retrieved = renderService.get("test-plugin:scripted");
    expect(retrieved?.renderVersion).toBe("map-v2");
    expect(retrieved?.runtimeScripts).toEqual([
      { src: "/scripts/map.js", defer: true },
    ]);
    expect(retrieved?.staticAssets).toEqual({
      "/scripts/map.js": "(function(){/* map */})();",
    });
  });

  test("view reads detach script and asset metadata without replacing schemas or renderers", () => {
    const script = {
      src: "/scripts/map.js",
      defer: true,
      module: false,
      get implementationState(): never {
        throw new Error("Not view metadata");
      },
    };
    const template: Template = {
      ...testTemplate,
      runtimeScripts: [script],
      staticAssets: { "/scripts/map.js": "original" },
    };
    templateRegistry.register(template.name, template);
    for (const view of [
      renderService.get(template.name),
      ...renderService.list(),
    ]) {
      if (!view?.runtimeScripts?.[0] || !view.staticAssets)
        throw new Error("Expected view metadata");
      expect(view.schema).toBe(template.schema);
      expect(view.renderers.web).toBe(template.layout.component);
      expect(Object.keys(view.runtimeScripts[0]).sort()).toEqual([
        "defer",
        "module",
        "src",
      ]);
      view.runtimeScripts[0].src = "/changed.js";
      view.runtimeScripts.push({ src: "/added.js" });
      view.staticAssets["/scripts/map.js"] = "changed";
    }
    expect(template.runtimeScripts).toHaveLength(1);
    expect(script.src).toBe("/scripts/map.js");
    expect(template.staticAssets).toEqual({ "/scripts/map.js": "original" });
    expect(renderService.get(template.name)?.runtimeScripts).toEqual([
      { src: "/scripts/map.js", defer: true, module: false },
    ]);
    expect(renderService.list()[0]?.staticAssets).toEqual({
      "/scripts/map.js": "original",
    });
    expect(renderService.getRenderer(template.name, "web")).toBe(
      template.layout.component,
    );
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
