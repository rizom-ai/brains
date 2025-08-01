import { describe, expect, test, beforeEach } from "bun:test";
import { ViewRegistry, RouteRegistry, ViewTemplateRegistry } from "../src";
import type { RouteDefinition } from "../src";
import type { Template } from "@brains/content-generator";
import { z } from "zod";

// Test schemas
const testSchema = z.object({
  title: z.string(),
  content: z.string(),
});

// Test template
const testTemplate: Template<{ title: string; content: string }> = {
  name: "test-plugin:test-template",
  description: "Test template",
  schema: testSchema,
  layout: {
    component: () => "Test component",
    interactive: false,
  },
};

// Test route
const testRoute: RouteDefinition = {
  id: "test-route",
  path: "/test",
  title: "Test Page",
  description: "A test page",
  pluginId: "test-plugin",
  sections: [
    {
      id: "main",
      template: "test-template",
    },
  ],
};

describe("ViewRegistry", () => {
  let viewRegistry: ViewRegistry;

  beforeEach(() => {
    ViewRegistry.resetInstance();
    RouteRegistry.resetInstance();
    ViewTemplateRegistry.resetInstance();
    viewRegistry = ViewRegistry.createFresh();
  });

  test("should register and retrieve routes", () => {
    viewRegistry.registerRoute(testRoute);

    const retrieved = viewRegistry.getRoute("/test");
    expect(retrieved).toEqual(testRoute);

    const routes = viewRegistry.listRoutes();
    expect(routes).toHaveLength(1);
    expect(routes[0]).toEqual(testRoute);
  });

  test("should register and retrieve templates", () => {
    viewRegistry.registerTemplate(testTemplate.name, testTemplate);

    const retrieved = viewRegistry.getViewTemplate("test-plugin:test-template");
    expect(retrieved).toBeDefined();
    expect(retrieved?.name).toBe("test-plugin:test-template");

    const templates = viewRegistry.listViewTemplates();
    expect(templates).toHaveLength(1);
  });

  test("should validate template content", () => {
    viewRegistry.registerTemplate(testTemplate.name, testTemplate);

    const validContent = { title: "Test", content: "Content" };
    const invalidContent = { title: "Test" }; // missing content

    expect(
      viewRegistry.validateViewTemplate(
        "test-plugin:test-template",
        validContent,
      ),
    ).toBe(true);
    expect(
      viewRegistry.validateViewTemplate(
        "test-plugin:test-template",
        invalidContent,
      ),
    ).toBe(false);
  });

  test("should find routes and templates by filter", () => {
    viewRegistry.registerRoute(testRoute);
    viewRegistry.registerTemplate(testTemplate.name, testTemplate);

    const foundRoute = viewRegistry.findRoute({ pluginId: "test-plugin" });
    expect(foundRoute).toEqual(testRoute);

    const foundTemplate = viewRegistry.findViewTemplate({
      pluginId: "test-plugin",
    });
    expect(foundTemplate?.name).toBe("test-plugin:test-template");
  });

  test("should handle renderer access", () => {
    viewRegistry.registerTemplate(testTemplate.name, testTemplate);

    const renderer = viewRegistry.getRenderer(
      "test-plugin:test-template",
      "web",
    );
    expect(renderer).toBeDefined();

    const hasRenderer = viewRegistry.hasRenderer(
      "test-plugin:test-template",
      "web",
    );
    expect(hasRenderer).toBe(true);

    const formats = viewRegistry.listFormats("test-plugin:test-template");
    expect(formats).toContain("web");
  });
});
