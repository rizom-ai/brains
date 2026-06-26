import { describe, it, expect, beforeEach } from "bun:test";
import { z } from "@brains/utils/zod-v4";
import { ContentService } from "../src/content-service";
import type { ContentServiceDependencies } from "../src/content-service";
import { TemplateRegistry, type Template } from "@brains/templates";
import {
  createSilentLogger,
  createMockEntityService,
  createMockAIService,
  createMockDataSourceRegistry,
} from "@brains/test-utils";

function makeTemplate(overrides: Partial<Template> = {}): Template {
  return {
    name: "test-template",
    description: "Template under test",
    schema: z.string(),
    requiredPermission: "public",
    ...overrides,
  };
}

describe("ContentService template access", () => {
  let contentService: ContentService;
  let templateRegistry: TemplateRegistry;

  beforeEach(() => {
    const mockLogger = createSilentLogger();
    templateRegistry = TemplateRegistry.createFresh(mockLogger);

    const mockDependencies: ContentServiceDependencies = {
      logger: mockLogger,
      entityService: createMockEntityService({ entityTypes: ["note"] }),
      aiService: createMockAIService(),
      templateRegistry,
      dataSourceRegistry: createMockDataSourceRegistry(),
    };

    contentService = new ContentService(mockDependencies);
  });

  describe("getTemplate", () => {
    it("returns null for an unknown template", () => {
      expect(contentService.getTemplate("missing")).toBeNull();
    });

    it("maps a registered template, omitting absent optional fields", () => {
      templateRegistry.register(
        "plain",
        makeTemplate({ name: "plain", basePrompt: "Generate something" }),
      );

      const template = contentService.getTemplate("plain");

      expect(template).toMatchObject({
        name: "plain",
        description: "Template under test",
        requiredPermission: "public",
        basePrompt: "Generate something",
      });
      expect(template).not.toHaveProperty("formatter");
      expect(template).not.toHaveProperty("dataSourceId");
    });
  });

  describe("listTemplates", () => {
    it("lists only templates with a basePrompt or formatter", () => {
      templateRegistry.register(
        "with-prompt",
        makeTemplate({ name: "with-prompt", basePrompt: "Generate" }),
      );
      templateRegistry.register(
        "with-formatter",
        makeTemplate({
          name: "with-formatter",
          formatter: {
            format: (data): string => String(data),
            parse: (content): unknown => content,
          },
        }),
      );
      templateRegistry.register(
        "render-only",
        makeTemplate({ name: "render-only" }),
      );

      const names = contentService.listTemplates().map((t) => t.name);

      expect(names.sort()).toEqual(["with-formatter", "with-prompt"]);
    });
  });

  describe("formatContent", () => {
    beforeEach(() => {
      templateRegistry.register(
        "formatted",
        makeTemplate({
          name: "formatted",
          formatter: {
            format: (data): string => `formatted: ${String(data)}`,
            parse: (content): unknown => content,
          },
        }),
      );
      templateRegistry.register(
        "no-formatter",
        makeTemplate({ name: "no-formatter", basePrompt: "Generate" }),
      );
    });

    it("formats data through the template formatter", () => {
      expect(contentService.formatContent("formatted", "hello")).toBe(
        "formatted: hello",
      );
    });

    it("truncates output and appends an ellipsis when over the limit", () => {
      const result = contentService.formatContent("formatted", "hello", {
        truncate: 10,
      });

      expect(result).toBe("formatted:...");
    });

    it("does not truncate output at or under the limit", () => {
      const result = contentService.formatContent("formatted", "hi", {
        truncate: 100,
      });

      expect(result).toBe("formatted: hi");
    });

    it("throws for an unknown template", () => {
      expect(() => contentService.formatContent("missing", "data")).toThrow(
        "Template not found: missing",
      );
    });

    it("throws for a template without a formatter", () => {
      expect(() =>
        contentService.formatContent("no-formatter", "data"),
      ).toThrow("Template no-formatter does not have a formatter");
    });

    it("scopes unqualified template names with the caller pluginId", () => {
      templateRegistry.register(
        "myplugin:card",
        makeTemplate({
          name: "card",
          formatter: {
            format: (data): string => `card: ${String(data)}`,
            parse: (content): unknown => content,
          },
        }),
      );

      const result = contentService.formatContent("card", "data", {
        pluginId: "myplugin",
      });

      expect(result).toBe("card: data");
    });

    it("leaves already-scoped template names untouched", () => {
      templateRegistry.register(
        "other:card",
        makeTemplate({
          name: "card",
          formatter: {
            format: (data): string => `other: ${String(data)}`,
            parse: (content): unknown => content,
          },
        }),
      );

      const result = contentService.formatContent("other:card", "data", {
        pluginId: "myplugin",
      });

      expect(result).toBe("other: data");
    });
  });
});
