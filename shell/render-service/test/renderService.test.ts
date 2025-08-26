import { describe, expect, test, beforeEach } from "bun:test";
import { RenderService, RouteRegistry } from "../src";
import type { RouteDefinition } from "../src";
import { TemplateRegistry } from "@brains/templates";
import type { Template } from "@brains/templates";
import { DataSourceRegistry } from "@brains/datasource";
import type { DataSource } from "@brains/datasource";
import { createSilentLogger } from "@brains/utils";
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

// Test template with DataSource
const testTemplateWithDataSource: Template = {
  name: "test-plugin:datasource-template",
  description: "Test template with DataSource",
  schema: testSchema,
  requiredPermission: "public",
  dataSourceId: "shell:mock-data",
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

// Mock DataSource
const mockDataSource: DataSource<{ title: string; content: string }> = {
  id: "mock-data",
  name: "Mock Data Source",
  description: "A test data source",
  async fetch() {
    return { title: "DataSource Title", content: "DataSource Content" };
  },
};

describe("RenderService", () => {
  let renderService: RenderService;
  let templateRegistry: TemplateRegistry;
  let dataSourceRegistry: DataSourceRegistry;

  beforeEach(() => {
    RenderService.resetInstance();
    TemplateRegistry.resetInstance();
    DataSourceRegistry.resetInstance();
    templateRegistry = TemplateRegistry.createFresh();
    dataSourceRegistry = DataSourceRegistry.createFresh(createSilentLogger());
    renderService = RenderService.createFresh(
      templateRegistry,
      dataSourceRegistry,
    );
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

  describe("resolveContent", () => {
    test("should return undefined for non-existent template", async () => {
      const result = await renderService.resolveContent(
        "non-existent:template",
      );
      expect(result).toBeUndefined();
    });

    test("should resolve static content", async () => {
      templateRegistry.register(testTemplate.name, testTemplate);

      const staticContent = {
        title: "Static Title",
        content: "Static Content",
      };
      const result = await renderService.resolveContent(testTemplate.name, {
        staticContent,
      });

      expect(result).toEqual(staticContent);
    });

    test("should resolve content from DataSource", async () => {
      templateRegistry.register(
        testTemplateWithDataSource.name,
        testTemplateWithDataSource,
      );
      dataSourceRegistry.register(mockDataSource);

      const result = await renderService.resolveContent(
        testTemplateWithDataSource.name,
      );

      expect(result).toEqual({
        title: "DataSource Title",
        content: "DataSource Content",
      });
    });

    test("should prioritize static content over DataSource", async () => {
      templateRegistry.register(
        testTemplateWithDataSource.name,
        testTemplateWithDataSource,
      );
      dataSourceRegistry.register(mockDataSource);

      const staticContent = {
        title: "Static Title",
        content: "Static Content",
      };
      const result = await renderService.resolveContent(
        testTemplateWithDataSource.name,
        {
          staticContent,
        },
      );

      expect(result).toEqual(staticContent);
    });

    test("should fall back to custom resolver", async () => {
      templateRegistry.register(testTemplate.name, testTemplate);

      const customResult = { title: "Custom Title", content: "Custom Content" };
      const result = await renderService.resolveContent(testTemplate.name, {
        customResolver: async () => customResult,
      });

      expect(result).toEqual(customResult);
    });

    test("should validate content against template schema", async () => {
      templateRegistry.register(testTemplate.name, testTemplate);

      // Mock console.warn to avoid test output noise
      const originalWarn = console.warn;
      console.warn = () => {};

      try {
        const invalidContent = { title: "Valid Title" }; // missing content
        const result = await renderService.resolveContent(testTemplate.name, {
          staticContent: invalidContent,
        });

        expect(result).toBeUndefined(); // Should fail validation and return undefined
      } finally {
        console.warn = originalWarn;
      }
    });

    test("should handle DataSource fetch errors gracefully", async () => {
      const errorDataSource: DataSource = {
        id: "error-data",
        name: "Error Data Source",
        async fetch() {
          throw new Error("DataSource error");
        },
      };

      const templateWithErrorDataSource: Template = {
        ...testTemplate,
        name: "test:error-template",
        dataSourceId: "shell:error-data",
      };

      templateRegistry.register(
        templateWithErrorDataSource.name,
        templateWithErrorDataSource,
      );
      dataSourceRegistry.register(errorDataSource);

      // Mock console.warn to avoid test output noise
      const originalWarn = console.warn;
      console.warn = () => {};

      try {
        const result = await renderService.resolveContent(
          templateWithErrorDataSource.name,
        );
        expect(result).toBeUndefined(); // Should handle error gracefully
      } finally {
        console.warn = originalWarn;
      }
    });

    test("should handle missing DataSource gracefully", async () => {
      templateRegistry.register(
        testTemplateWithDataSource.name,
        testTemplateWithDataSource,
      );
      // Don't register the DataSource

      // Mock console.warn to avoid test output noise
      const originalWarn = console.warn;
      console.warn = () => {};

      try {
        const result = await renderService.resolveContent(
          testTemplateWithDataSource.name,
        );
        expect(result).toBeUndefined(); // Should handle missing DataSource gracefully
      } finally {
        console.warn = originalWarn;
      }
    });
  });
});

describe("RouteRegistry", () => {
  let routeRegistry: RouteRegistry;

  beforeEach(() => {
    RouteRegistry.resetInstance();
    routeRegistry = RouteRegistry.createFresh();
  });

  test("should register and retrieve routes", () => {
    routeRegistry.register(testRoute);

    const retrieved = routeRegistry.get("/test");
    expect(retrieved).toEqual(testRoute);

    const routes = routeRegistry.list();
    expect(routes).toHaveLength(1);
    expect(routes[0]).toEqual(testRoute);
  });

  test("should prevent duplicate route paths", () => {
    routeRegistry.register(testRoute);

    const duplicateRoute = { ...testRoute, id: "different-id" };
    expect(() => routeRegistry.register(duplicateRoute)).toThrow();
  });

  test("should unregister routes", () => {
    routeRegistry.register(testRoute);
    expect(routeRegistry.get("/test")).toBeDefined();

    routeRegistry.unregister("/test");
    expect(routeRegistry.get("/test")).toBeUndefined();
  });

  test("should list routes by plugin", () => {
    const anotherRoute = {
      ...testRoute,
      id: "another-route",
      path: "/another",
      pluginId: "another-plugin",
    };

    routeRegistry.register(testRoute);
    routeRegistry.register(anotherRoute);

    const testPluginRoutes = routeRegistry.listByPlugin("test-plugin");
    expect(testPluginRoutes).toHaveLength(1);
    expect(testPluginRoutes[0]?.id).toBe("test-route");

    const anotherPluginRoutes = routeRegistry.listByPlugin("another-plugin");
    expect(anotherPluginRoutes).toHaveLength(1);
    expect(anotherPluginRoutes[0]?.id).toBe("another-route");
  });
});
