import { describe, it, expect, mock, spyOn } from "bun:test";
import { TemplateCapabilities } from "../src/capabilities";
import { createTemplate, type ComponentType } from "../src/types";
import { z } from "@brains/utils";
import type { ContentFormatter } from "@brains/utils";
import { createSilentLogger } from "@brains/utils";
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
    it("should error when basePrompt is used without AI dataSource", () => {
      const template = createTemplate({
        name: "test",
        description: "Test template",
        schema: z.string(),
        basePrompt: "Generate content",
        dataSourceId: "shell:system-stats",
        requiredPermission: "public",
      });

      const errors = TemplateCapabilities.validate(template);
      expect(errors).toContain(
        'Template "test" has basePrompt but no AI-content dataSourceId. The basePrompt won\'t be used.',
      );
    });

    it("should error when AI dataSource is used without basePrompt", () => {
      const template = createTemplate({
        name: "test",
        description: "Test template",
        schema: z.string(),
        dataSourceId: "shell:ai-content",
        requiredPermission: "public",
      });

      const errors = TemplateCapabilities.validate(template);
      expect(errors).toContain(
        'Template "test" has AI-content dataSourceId but no basePrompt. AI generation requires a basePrompt.',
      );
    });

    it("should return no errors for fetch-only template", () => {
      const template = createTemplate({
        name: "test",
        description: "Test template",
        schema: z.string(),
        dataSourceId: "shell:system-stats",
        requiredPermission: "public",
      });

      const errors = TemplateCapabilities.validate(template);
      expect(errors).toEqual([]);
    });

    it("should return no errors for static-only template", () => {
      const template = createTemplate({
        name: "test",
        description: "Test template",
        schema: z.string(),
        requiredPermission: "public",
        formatter: mockFormatter,
        layout: {
          component: mockComponent,
        },
      });

      const errors = TemplateCapabilities.validate(template);
      expect(errors).toEqual([]);
    });

    it("should return no errors for interactive template with dataSource", () => {
      const template = createTemplate({
        name: "test",
        description: "Test template",
        schema: z.string(),
        dataSourceId: "shell:system-stats",
        requiredPermission: "public",
        layout: {
          component: mockComponent,
          interactive: true,
        },
      });

      const errors = TemplateCapabilities.validate(template);
      expect(errors).toEqual([]);
    });

    it("should return no errors for well-configured AI generation template", () => {
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

      const errors = TemplateCapabilities.validate(template);
      expect(errors).toEqual([]);
    });
  });

  describe("logCapabilities", () => {
    it("should log capabilities with errors", () => {
      const logger = createSilentLogger();
      const debugSpy = spyOn(logger, "debug");

      const template = createTemplate({
        name: "test",
        description: "Test template",
        schema: z.string(),
        basePrompt: "Generate content",
        dataSourceId: "shell:system-stats", // Wrong dataSource for generation
        requiredPermission: "public",
      });

      TemplateCapabilities.logCapabilities(template, logger);

      expect(debugSpy).toHaveBeenCalledWith(
        'Template capabilities for "test":',
        expect.objectContaining({
          canGenerate: false,
          canFetch: true,
          canRender: false,
          isStaticOnly: false,
          errors: expect.arrayContaining([
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
