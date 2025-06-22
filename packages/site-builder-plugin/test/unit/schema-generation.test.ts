import { describe, it, expect } from "bun:test";
import { generateContentConfigFile } from "../../src/schema-generator";
import { z } from "zod";

describe("Schema Generation", () => {
  describe("generateContentConfigFile", () => {
    it("should generate valid Astro content config", () => {
      const schemas = new Map<string, z.ZodType<unknown>>();

      // Add test schemas
      schemas.set(
        "landing",
        z.object({
          title: z.string(),
          tagline: z.string(),
          hero: z.object({
            headline: z.string(),
            subheadline: z.string(),
            ctaText: z.string(),
            ctaLink: z.string(),
          }),
          features: z.object({
            label: z.string(),
            headline: z.string(),
            description: z.string(),
            features: z
              .array(
                z.object({
                  icon: z.string(),
                  title: z.string(),
                  description: z.string(),
                }),
              )
              .min(1)
              .max(4),
          }),
        }),
      );

      schemas.set(
        "pages",
        z.object({
          title: z.string(),
          path: z.string(),
          description: z.string().optional(),
        }),
      );

      const config = generateContentConfigFile(schemas);

      // Check for required imports
      expect(config).toContain(
        'import { defineCollection, z } from "astro:content"',
      );

      // Check for auto-generated comment
      expect(config).toContain(
        "// This file is auto-generated. Do not edit manually.",
      );

      // Check for schema definitions
      expect(config).toContain("// Schema for landing");
      expect(config).toContain("const landingSchema =");
      expect(config).toContain("// Schema for pages");
      expect(config).toContain("const pagesSchema =");

      // Check for collection definitions
      expect(config).toContain("const landingCollection = defineCollection({");
      expect(config).toContain("const pagesCollection = defineCollection({");
      expect(config).toContain('type: "data"');
      expect(config).toContain("schema: landingSchema");
      expect(config).toContain("schema: pagesSchema");

      // Check for exports
      expect(config).toContain("export const collections = {");
      expect(config).toContain("landing: landingCollection,");
      expect(config).toContain("pages: pagesCollection,");
    });

    it("should handle schema conversion correctly", () => {
      const schemas = new Map<string, z.ZodType<unknown>>();

      schemas.set(
        "test",
        z.object({
          headline: z.string(),
          features: z.array(z.string()),
        }),
      );

      const config = generateContentConfigFile(schemas);

      // Check that schemas are properly converted to Zod code
      expect(config).toContain("z.object({");
      expect(config).toContain("z.string()");

      // Check specific field definitions (with quotes as per JSON Schema conversion)
      expect(config).toContain('"headline"');
      expect(config).toContain('"features"');
    });

    it("should handle invalid schemas gracefully", () => {
      const schemas = new Map<string, z.ZodType<unknown>>();

      // Add an invalid schema type for JSON Schema conversion
      schemas.set("invalid", z.function() as unknown as z.ZodType<unknown>);

      const config = generateContentConfigFile(schemas);

      // Should generate some form of schema (either fallback or converted)
      expect(config).toContain("// Schema for invalid");
      expect(config).toContain("const invalidSchema = z.");
    });

    it("should create collections for all provided schemas", () => {
      const schemas = new Map<string, z.ZodType<unknown>>();

      schemas.set("landing", z.object({ title: z.string() }));
      schemas.set("pages", z.object({ path: z.string() }));
      schemas.set("blog", z.object({ content: z.string() }));

      const config = generateContentConfigFile(schemas);

      // Should have collections for all schemas
      expect(config).toContain("const landingCollection = defineCollection({");
      expect(config).toContain("const pagesCollection = defineCollection({");
      expect(config).toContain("const blogCollection = defineCollection({");

      // Check that collections use the correct schemas
      expect(config).toMatch(/landing: landingCollection/);
      expect(config).toMatch(/pages: pagesCollection/);
      expect(config).toMatch(/blog: blogCollection/);
    });

    it("should handle empty schemas map", () => {
      const schemas = new Map<string, z.ZodType<unknown>>();

      const config = generateContentConfigFile(schemas);

      // Should still generate valid config structure
      expect(config).toContain(
        'import { defineCollection, z } from "astro:content"',
      );
      expect(config).toContain("export const collections = {");
      expect(config).toContain("};");
    });
  });
});
