import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { WebserverManager } from "../../src/webserver-manager";
import type { Logger } from "@brains/utils";
import type { Registry, PluginContext } from "@brains/types";
import { existsSync, readFileSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { mkdtempSync } from "fs";

describe("Schema Generation", () => {
  let tempDir: string;
  let manager: WebserverManager;
  let mockLogger: Logger;
  let mockRegistry: Registry;
  let mockContext: PluginContext;

  beforeEach(() => {
    // Create temp directory
    tempDir = mkdtempSync(join(tmpdir(), "schema-gen-test-"));

    // Mock logger
    mockLogger = {
      info: () => {},
      debug: () => {},
      warn: () => {},
      error: () => {},
      child: () => mockLogger,
    } as any;

    // Mock registry and context
    mockRegistry = {} as any;
    mockContext = {} as any;

    // Create manager instance
    manager = new WebserverManager({
      logger: mockLogger,
      registry: mockRegistry,
      context: mockContext,
      outputDir: tempDir,
      previewPort: 4321,
      productionPort: 8080,
      siteTitle: "Test Site",
      siteDescription: "Test Description",
    });
  });

  afterEach(() => {
    // Clean up temp directory
    if (existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe("content-schemas.ts file copy", () => {
    it("should copy content-schemas.ts as schemas.ts", async () => {
      // Mock components
      (manager as any).contentGenerator = {
        generateAll: async () => {},
      };
      (manager as any).siteBuilder = {
        build: async () => {},
      };

      await manager.buildSite();

      const schemasPath = join(tempDir, ".astro-work", "src", "schemas.ts");
      expect(existsSync(schemasPath)).toBe(true);

      const schemaContent = readFileSync(schemasPath, "utf-8");

      // Check basic structure
      expect(schemaContent).toContain('import { z } from "zod"');
      expect(schemaContent).toContain("export const landingPageSchema");
      expect(schemaContent).toContain("export const dashboardSchema");
      expect(schemaContent).toContain("export const landingHeroDataSchema");

      // Check type exports
      expect(schemaContent).toContain("export type LandingPageData");
      expect(schemaContent).toContain("export type DashboardData");
      expect(schemaContent).toContain("export type LandingHeroData");

      // Should not contain workspace references
      expect(schemaContent).not.toContain("@brains/");
      expect(schemaContent).not.toContain("workspace:");
      expect(schemaContent).not.toContain("baseEntitySchema");
    });
  });

  describe("content/config.ts generation", () => {
    it("should generate config that imports from schemas", async () => {
      // Mock content generator to avoid complex setup
      (manager as any).contentGenerator = {
        generateAll: async () => {},
      };

      // Mock site builder
      (manager as any).siteBuilder = {
        build: async () => {},
      };

      // Build site to trigger generation
      await manager.buildSite();

      // Check that content/config.ts was created
      const configPath = join(
        tempDir,
        ".astro-work",
        "src",
        "content",
        "config.ts",
      );
      expect(existsSync(configPath)).toBe(true);

      // Read and verify content
      const configContent = readFileSync(configPath, "utf-8");

      // Should import from generated schemas
      expect(configContent).toContain(
        'import { defineCollection } from "astro:content"',
      );
      expect(configContent).toContain(
        'import { landingPageSchema, dashboardSchema } from "../schemas"',
      );

      // Should not have inline schema definitions
      expect(configContent).not.toContain("z.object({");
      expect(configContent).not.toContain("z.string()");
      expect(configContent).not.toContain("z.number()");

      // Should define collections using imported schemas
      expect(configContent).toContain("schema: landingPageSchema");
      expect(configContent).toContain("schema: dashboardSchema");

      // Should export collections
      expect(configContent).toContain("export const collections = {");
      expect(configContent).toContain("landing: landingCollection");
      expect(configContent).toContain("dashboard: dashboardCollection");
    });

    it("should generate both schemas.ts and config.ts in correct order", async () => {
      // Mock components
      (manager as any).contentGenerator = {
        generateAll: async () => {},
      };
      (manager as any).siteBuilder = {
        build: async () => {},
      };

      await manager.buildSite();

      // Both files should exist
      const schemasPath = join(tempDir, ".astro-work", "src", "schemas.ts");
      const configPath = join(
        tempDir,
        ".astro-work",
        "src",
        "content",
        "config.ts",
      );

      expect(existsSync(schemasPath)).toBe(true);
      expect(existsSync(configPath)).toBe(true);

      // Verify schemas.ts has actual schema definitions
      const schemasContent = readFileSync(schemasPath, "utf-8");
      expect(schemasContent).toContain("z.object({");
      expect(schemasContent).toContain("export const landingPageSchema");

      // Verify config.ts imports from schemas.ts
      const configContent = readFileSync(configPath, "utf-8");
      expect(configContent).toContain('from "../schemas"');
    });
  });
});
