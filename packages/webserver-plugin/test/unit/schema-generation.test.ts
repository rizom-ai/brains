import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { WebserverManager } from "../../src/webserver-manager";
import { createSilentLogger } from "@brains/utils";
import type { PluginContext } from "@brains/types";
import { existsSync, readFileSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { mkdtempSync } from "fs";

// Helper to ensure directories exist
async function ensureWorkingDirStructure(workingDir: string): Promise<void> {
  const { mkdir } = await import("fs/promises");
  await mkdir(join(workingDir, "src"), { recursive: true });
}

describe("Schema Generation", () => {
  let tempDir: string;
  let manager: WebserverManager;
  let mockContext: PluginContext;

  beforeEach(() => {
    // Create temp directory
    tempDir = mkdtempSync(join(tmpdir(), "schema-gen-test-"));

    // Mock context
    mockContext = {} as PluginContext;

    // Create manager instance
    manager = new WebserverManager({
      logger: createSilentLogger("schema-gen-test"),
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
      // Ensure working directory structure exists
      const workingDir = manager.getWorkingDir();
      await ensureWorkingDirStructure(workingDir);

      // Test the schema generation directly
      await manager.generateSchemas();

      const schemasPath = join(workingDir, "src", "schemas.ts");
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
      // Ensure working directory structure exists
      const workingDir = manager.getWorkingDir();
      await ensureWorkingDirStructure(workingDir);

      // Test the content config generation directly
      await manager.generateContentConfig();

      // Check that content/config.ts was created
      const configPath = join(workingDir, "src", "content", "config.ts");
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
      // Ensure working directory structure exists
      const workingDir = manager.getWorkingDir();
      await ensureWorkingDirStructure(workingDir);

      // Generate both files in the correct order
      await manager.generateSchemas();
      await manager.generateContentConfig();

      // Both files should exist
      const schemasPath = join(workingDir, "src", "schemas.ts");
      const configPath = join(workingDir, "src", "content", "config.ts");

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
