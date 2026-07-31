import { describe, it, expect } from "bun:test";
import { z } from "@brains/utils/zod";
import { createTemplate, TemplateSchema, type Template } from "../src";

createTemplate({
  name: "nullable-view",
  description: "JSON-native rendered template",
  schema: z.object({ label: z.string().nullable().default(null) }),
  requiredPermission: "public",
  layout: {},
});

// @ts-expect-error Rendered template output cannot contain `undefined`.
createTemplate({
  name: "optional-view",
  description: "Invalid rendered template",
  schema: z.object({ label: z.string().optional() }),
  requiredPermission: "public",
  layout: {},
});

// @ts-expect-error Rendered template output must be a JSON object.
createTemplate({
  name: "primitive-view",
  description: "Invalid rendered template",
  schema: z.string(),
  requiredPermission: "public",
  layout: {},
});

// Generation-only templates may still use non-object output.
createTemplate({
  name: "primitive-generation",
  description: "Non-rendered template",
  schema: z.string(),
  requiredPermission: "public",
});

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
      useKnowledgeContext: true,
      layout: {
        fullscreen: true,
      },
      dataSourceId: "test-provider",
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
      dataSourceId: "static-provider",
      layout: {},
    };

    const result = TemplateSchema.safeParse(template);
    expect(result.success).toBe(true);
  });
});
