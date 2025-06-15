import { describe, it, expect } from "bun:test";
import { generateContentConfigFile } from "../../src/schema-generator";
import type { ContentRegistry } from "../../src/content/registry";
import { contentRegistry } from "../../src/content/registry";
import { z } from "zod";

describe("Schema Generation", () => {
  describe("generateContentConfigFile", () => {
    it("should generate valid Astro content config", async () => {
      const config = await generateContentConfigFile(contentRegistry);

      // Check for required imports
      expect(config).toContain(
        'import { defineCollection, z } from "astro:content"',
      );

      // Check for auto-generated comment
      expect(config).toContain(
        "// This file is auto-generated. Do not edit manually.",
      );

      // Check for schema definitions with new naming
      expect(config).toContain("// Schema for webserver landing");
      expect(config).toContain("const webserverLandingSchema =");
      expect(config).toContain("// Schema for webserver dashboard");
      expect(config).toContain("const webserverDashboardSchema =");

      // Check for collection definitions
      expect(config).toContain("const landingCollection = defineCollection({");
      expect(config).toContain(
        "const dashboardCollection = defineCollection({",
      );
      expect(config).toContain('type: "data"');
      expect(config).toContain("schema: webserverLandingSchema");
      expect(config).toContain("schema: webserverDashboardSchema");

      // Check for exports
      expect(config).toContain("export const collections = {");
      expect(config).toContain("landing: landingCollection,");
      expect(config).toContain("dashboard: dashboardCollection,");
    });

    it("should handle schema conversion correctly", async () => {
      const config = await generateContentConfigFile(contentRegistry);

      // Check that schemas are properly converted to Zod code
      expect(config).toContain("z.object({");
      expect(config).toContain("z.string()");

      // Check specific field definitions (with quotes as per JSON Schema conversion)
      expect(config).toContain('"headline"'); // From hero schema
      expect(config).toContain('"features"'); // From features schema
      expect(config).toContain('"primaryButton"'); // From CTA schema
      expect(config).toContain('"stats"'); // From dashboard schema
    });

    it("should handle composite schemas correctly", async () => {
      const config = await generateContentConfigFile(contentRegistry);

      // Landing page composite schema should include all sections
      // Look for the complete schema definition including nested objects
      const landingSchemaMatch = config.match(
        /const webserverLandingSchema = z\.object\({[^}]+}\)[^}]*}\)[^}]*}\)/s,
      );
      expect(landingSchemaMatch).toBeTruthy();

      if (landingSchemaMatch) {
        const landingSchema = landingSchemaMatch[0];
        expect(landingSchema).toContain('"title"');
        expect(landingSchema).toContain('"tagline"');
        expect(landingSchema).toContain('"hero"');
        // The full schema is flattened, so we check that it contains nested properties
        expect(landingSchema).toContain("z.object({"); // Multiple nested objects
      }
    });

    it("should handle invalid schemas gracefully", async () => {
      // Create a test registry with an invalid schema
      const testRegistry = {
        getTemplateKeys: () => ["test:invalid"],
        getTemplate: (key: string) => {
          if (key === "test:invalid") {
            return {
              name: "test-invalid",
              description: "Test",
              schema: z.function(), // Invalid schema type for JSON Schema conversion
              basePrompt: "",
            };
          }
          return null;
        },
      } as unknown as ContentRegistry;

      const config = await generateContentConfigFile(testRegistry);

      // Should generate fallback schema or use z.any() for functions
      expect(config).toContain("// Schema for test invalid");
      expect(config).toContain("const testInvalidSchema = z.");
    });

    it("should create collections for all registered templates", async () => {
      const config = await generateContentConfigFile(contentRegistry);

      // Should have collections for landing and dashboard
      expect(config).toContain("const landingCollection = defineCollection({");
      expect(config).toContain(
        "const dashboardCollection = defineCollection({",
      );

      // Check that collections use the correct schemas
      expect(config).toMatch(/landing: landingCollection/);
      expect(config).toMatch(/dashboard: dashboardCollection/);

      // Verify we only have two templates registered
      const keys = contentRegistry.getTemplateKeys();
      expect(keys).toEqual(["webserver:landing", "webserver:dashboard"]);
    });
  });
});
