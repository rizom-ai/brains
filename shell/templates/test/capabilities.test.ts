import { describe, it, expect, mock } from "bun:test";
import { TemplateCapabilities } from "../src/capabilities";
import { createTemplate, type ComponentType } from "../src/types";
import { z } from "zod";
import type { ContentFormatter } from "@brains/utils";
import { h } from "preact";

describe("TemplateCapabilities", () => {
  const mockFormatter: ContentFormatter<unknown> = {
    format: mock((data: unknown) => `formatted: ${JSON.stringify(data)}`),
    parse: mock((content: string) => ({ parsed: content })),
  };

  const mockComponent: ComponentType = () => h("div", {}, "Test Component");

  describe("canGenerate", () => {
    it("should return true for templates with basePrompt and ai-content dataSourceId", () => {
      const template = createTemplate({
        name: "test",
        description: "Test template",
        schema: z.string(),
        basePrompt: "Generate content",
        dataSourceId: "shell:ai-content",
        requiredPermission: "public",
      });

      expect(TemplateCapabilities.canGenerate(template)).toBe(true);
    });

    it("should return false for templates with basePrompt but no ai-content dataSourceId", () => {
      const template = createTemplate({
        name: "test",
        description: "Test template",
        schema: z.string(),
        basePrompt: "Generate content",
        dataSourceId: "shell:system-stats",
        requiredPermission: "public",
      });

      expect(TemplateCapabilities.canGenerate(template)).toBe(false);
    });

    it("should return false for templates without basePrompt", () => {
      const template = createTemplate({
        name: "test",
        description: "Test template",
        schema: z.string(),
        dataSourceId: "shell:ai-content",
        requiredPermission: "public",
      });

      expect(TemplateCapabilities.canGenerate(template)).toBe(false);
    });

    it("should return false for templates without dataSourceId", () => {
      const template = createTemplate({
        name: "test",
        description: "Test template",
        schema: z.string(),
        basePrompt: "Generate content",
        requiredPermission: "public",
      });

      expect(TemplateCapabilities.canGenerate(template)).toBe(false);
    });
  });

  describe("canFetch", () => {
    it("should return true for templates with non-AI dataSourceId", () => {
      const template = createTemplate({
        name: "test",
        description: "Test template",
        schema: z.string(),
        dataSourceId: "shell:system-stats",
        requiredPermission: "public",
      });

      expect(TemplateCapabilities.canFetch(template)).toBe(true);
    });

    it("should return false for templates with AI dataSourceId and basePrompt", () => {
      const template = createTemplate({
        name: "test",
        description: "Test template",
        schema: z.string(),
        basePrompt: "Generate content",
        dataSourceId: "shell:ai-content",
        requiredPermission: "public",
      });

      expect(TemplateCapabilities.canFetch(template)).toBe(false);
    });

    it("should return false for templates without dataSourceId", () => {
      const template = createTemplate({
        name: "test",
        description: "Test template",
        schema: z.string(),
        requiredPermission: "public",
      });

      expect(TemplateCapabilities.canFetch(template)).toBe(false);
    });
  });

  describe("canRender", () => {
    it("should return true for templates with layout component", () => {
      const template = createTemplate({
        name: "test",
        description: "Test template",
        schema: z.string(),
        requiredPermission: "public",
        layout: {
          component: mockComponent,
        },
      });

      expect(TemplateCapabilities.canRender(template)).toBe(true);
    });

    it("should return true for interactive templates", () => {
      const template = createTemplate({
        name: "test",
        description: "Test template",
        schema: z.string(),
        requiredPermission: "public",
        layout: {
          component: mockComponent,
          interactive: true,
        },
      });

      expect(TemplateCapabilities.canRender(template)).toBe(true);
    });

    it("should return false for templates without layout", () => {
      const template = createTemplate({
        name: "test",
        description: "Test template",
        schema: z.string(),
        requiredPermission: "public",
      });

      expect(TemplateCapabilities.canRender(template)).toBe(false);
    });
  });

  describe("isStaticOnly", () => {
    it("should return true for templates without dataSourceId or basePrompt", () => {
      const template = createTemplate({
        name: "test",
        description: "Test template",
        schema: z.string(),
        requiredPermission: "public",
        layout: {
          component: mockComponent,
        },
      });

      expect(TemplateCapabilities.isStaticOnly(template)).toBe(true);
    });

    it("should return false for templates with dataSourceId", () => {
      const template = createTemplate({
        name: "test",
        description: "Test template",
        schema: z.string(),
        dataSourceId: "shell:system-stats",
        requiredPermission: "public",
      });

      expect(TemplateCapabilities.isStaticOnly(template)).toBe(false);
    });

    it("should return false for templates that can generate", () => {
      const template = createTemplate({
        name: "test",
        description: "Test template",
        schema: z.string(),
        basePrompt: "Generate content",
        dataSourceId: "shell:ai-content",
        requiredPermission: "public",
      });

      expect(TemplateCapabilities.isStaticOnly(template)).toBe(false);
    });
  });

  describe("getCapabilities", () => {
    it("should return all capabilities for a complex template", () => {
      const template = createTemplate({
        name: "test",
        description: "Test template",
        schema: z.string(),
        basePrompt: "Generate content",
        dataSourceId: "shell:ai-content",
        requiredPermission: "public",
        formatter: mockFormatter,
        layout: {
          component: mockComponent,
          interactive: true,
        },
      });

      const caps = TemplateCapabilities.getCapabilities(template);
      expect(caps).toEqual({
        canGenerate: true,
        canFetch: false,
        canRender: true,
        isStaticOnly: false,
      });
    });

    it("should return all capabilities for a fetch-only template", () => {
      const template = createTemplate({
        name: "test",
        description: "Test template",
        schema: z.string(),
        dataSourceId: "shell:system-stats",
        requiredPermission: "public",
        layout: {
          component: mockComponent,
        },
      });

      const caps = TemplateCapabilities.getCapabilities(template);
      expect(caps).toEqual({
        canGenerate: false,
        canFetch: true,
        canRender: true,
        isStaticOnly: false,
      });
    });

    it("should return all capabilities for a static-only template", () => {
      const template = createTemplate({
        name: "test",
        description: "Test template",
        schema: z.string(),
        requiredPermission: "public",
        layout: {
          component: mockComponent,
        },
      });

      const caps = TemplateCapabilities.getCapabilities(template);
      expect(caps).toEqual({
        canGenerate: false,
        canFetch: false,
        canRender: true,
        isStaticOnly: true,
      });
    });
  });

  describe("validate", () => {
    it("should warn about basePrompt without AI dataSource", () => {
      const template = createTemplate({
        name: "test",
        description: "Test template",
        schema: z.string(),
        basePrompt: "Generate content",
        dataSourceId: "shell:system-stats",
        requiredPermission: "public",
      });

      const warnings = TemplateCapabilities.validate(template);
      expect(warnings).toContain(
        'Template "test" has basePrompt but no AI-content dataSourceId. It won\'t be able to generate content.',
      );
    });

    it("should warn about AI dataSource without basePrompt", () => {
      const template = createTemplate({
        name: "test",
        description: "Test template",
        schema: z.string(),
        dataSourceId: "shell:ai-content",
        requiredPermission: "public",
      });

      const warnings = TemplateCapabilities.validate(template);
      expect(warnings).toContain(
        'Template "test" has AI-content dataSourceId but no basePrompt. Consider adding a basePrompt or using a different dataSource.',
      );
    });

    it("should warn about formatter without content source", () => {
      const template = createTemplate({
        name: "test",
        description: "Test template",
        schema: z.string(),
        requiredPermission: "public",
        formatter: mockFormatter,
      });

      const warnings = TemplateCapabilities.validate(template);
      expect(warnings).toContain(
        'Template "test" has a formatter but no content source (basePrompt or dataSourceId).',
      );
    });

    it("should warn about interactive components without dataSource", () => {
      const template = createTemplate({
        name: "test",
        description: "Test template",
        schema: z.string(),
        requiredPermission: "public",
        layout: {
          component: mockComponent,
          interactive: true,
        },
      });

      const warnings = TemplateCapabilities.validate(template);
      expect(warnings).toContain(
        'Template "test" is marked as interactive but has no dataSourceId for dynamic data.',
      );
    });

    it("should return no warnings for a well-configured template", () => {
      const template = createTemplate({
        name: "test",
        description: "Test template",
        schema: z.string(),
        basePrompt: "Generate content",
        dataSourceId: "shell:ai-content",
        requiredPermission: "public",
        formatter: mockFormatter,
        layout: {
          component: mockComponent,
        },
      });

      const warnings = TemplateCapabilities.validate(template);
      expect(warnings).toEqual([]);
    });
  });

  describe("logCapabilities", () => {
    it("should log capabilities with warnings", () => {
      const mockLogger = {
        debug: mock(),
      };

      const template = createTemplate({
        name: "test",
        description: "Test template",
        schema: z.string(),
        basePrompt: "Generate content",
        dataSourceId: "shell:system-stats", // Wrong dataSource for generation
        requiredPermission: "public",
      });

      TemplateCapabilities.logCapabilities(template, mockLogger);

      expect(mockLogger.debug).toHaveBeenCalledWith(
        'Template capabilities for "test":',
        expect.objectContaining({
          canGenerate: false,
          canFetch: true,
          canRender: false,
          isStaticOnly: false,
          warnings: expect.arrayContaining([
            expect.stringContaining(
              "basePrompt but no AI-content dataSourceId",
            ),
          ]),
        }),
      );
    });

    it("should work without a logger", () => {
      const template = createTemplate({
        name: "test",
        description: "Test template",
        schema: z.string(),
        requiredPermission: "public",
      });

      // Should not throw
      expect(() => {
        TemplateCapabilities.logCapabilities(template);
      }).not.toThrow();
    });
  });
});
