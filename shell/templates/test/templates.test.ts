import { describe, it, expect } from "bun:test";
import { z } from "zod";
import { TemplateSchema, type Template } from "../src";

describe("Templates", () => {
  it("should validate a basic template", () => {
    const template: Template = {
      name: "test",
      description: "Test template",
      schema: z.object({ title: z.string() }),
      requiredPermission: "public",
    };

    const result = TemplateSchema.safeParse(template);
    expect(result.success).toBe(true);
  });

  it("should validate a template with all capabilities", () => {
    const template: Template = {
      name: "full",
      description: "Full-featured template",
      schema: z.object({ content: z.string() }),
      requiredPermission: "trusted",
      basePrompt: "Generate content",
      layout: {
        interactive: true,
      },
      providerId: "test-provider",
    };

    const result = TemplateSchema.safeParse(template);
    expect(result.success).toBe(true);
  });

  it("should handle templates with only content generation capability", () => {
    const template: Template = {
      name: "content-only",
      description: "Content generation only",
      schema: z.object({ text: z.string() }),
      requiredPermission: "public",
      basePrompt: "Generate text content",
    };

    const result = TemplateSchema.safeParse(template);
    expect(result.success).toBe(true);
  });

  it("should handle templates with only view rendering capability", () => {
    const template: Template = {
      name: "view-only",
      description: "View rendering only",
      schema: z.object({ data: z.string() }),
      requiredPermission: "public",
      providerId: "static-provider",
      layout: {
        interactive: false,
      },
    };

    const result = TemplateSchema.safeParse(template);
    expect(result.success).toBe(true);
  });
});
