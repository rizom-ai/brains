import { describe, expect, test, beforeEach } from "bun:test";
import { RenderService } from "../src/render-service";
import {
  InMemoryTemplateRegistry,
  type TemplateRegistry,
} from "../src/registry";
import { createTemplate, type Template } from "../src/types";
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
      runtimeScripts: [{ src: "/scripts/map.js", defer: true }],
      staticAssets: { "/scripts/map.js": "(function(){/* map */})();" },
    };
    templateRegistry.register(scriptedTemplate.name, scriptedTemplate);

    const retrieved = renderService.get("test-plugin:scripted");
    expect(retrieved?.runtimeScripts).toEqual([
      { src: "/scripts/map.js", defer: true },
    ]);
    expect(retrieved?.staticAssets).toEqual({
      "/scripts/map.js": "(function(){/* map */})();",
    });
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

  test("renders a print-only template in its own format, never as a page", () => {
    const seen: unknown[] = [];
    const printable = createTemplate<{ title: string }>({
      name: "test-plugin:printable",
      description: "Printable",
      schema: z.object({ title: z.string() }),
      requiredPermission: "public",
      layout: {
        formats: {
          pdf: (props) => {
            seen.push(props);
            return h("h1", null, props.title);
          },
        },
      },
    });
    templateRegistry.register("test-plugin:printable", printable);

    const view = renderService.get("test-plugin:printable");
    expect(Object.keys(view?.renderers ?? {})).toEqual(["pdf"]);
    expect(renderService.listFormats("test-plugin:printable")).toEqual(["pdf"]);
    expect(
      renderService.validate("test-plugin:printable", { title: "T" }),
    ).toBe(true);

    const pdf = renderService.getRenderer("test-plugin:printable", "pdf");
    if (typeof pdf !== "function") throw new Error("no pdf renderer");
    // The renderer parses its props like a page component does.
    pdf({ title: "T", extra: "dropped" });
    expect(seen).toEqual([{ title: "T" }]);
    expect(() => pdf({})).toThrow();
  });

  test("an EPUB is one more format a template renders", () => {
    templateRegistry.register(
      "test-plugin:book",
      createTemplate<{ title: string }>({
        name: "test-plugin:book",
        description: "Book",
        schema: z.object({ title: z.string() }),
        requiredPermission: "public",
        layout: { formats: { epub: (props) => h("h1", null, props.title) } },
      }),
    );

    expect(renderService.listFormats("test-plugin:book")).toEqual(["epub"]);
  });
});
