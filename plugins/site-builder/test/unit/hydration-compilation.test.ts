import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { promises as fs } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { HydrationManager } from "../../src/hydration/hydration-manager";
import { createSilentLogger } from "@brains/test-utils";
import type { ServicePluginContext } from "@brains/plugins";

describe("HydrationManager - compileHydrationScript", () => {
  let outputDir: string;
  let hydrationManager: HydrationManager;

  beforeEach(async () => {
    // Create a temporary output directory
    outputDir = join(tmpdir(), `hydration-test-${Date.now()}`);
    await fs.mkdir(outputDir, { recursive: true });

    // Create HydrationManager with minimal dependencies
    const logger = createSilentLogger("hydration-test");
    const mockGetViewTemplate = (): undefined => undefined;
    const mockPluginContext: Pick<ServicePluginContext, "plugins"> = {
      plugins: {
        getPackageName: (pluginId: string): string | undefined => {
          if (pluginId === "dashboard") return "@brains/dashboard";
          return undefined;
        },
      },
    };

    hydrationManager = new HydrationManager(
      logger,
      mockGetViewTemplate,
      mockPluginContext as ServicePluginContext,
      outputDir,
    );
  });

  afterEach(async () => {
    // Clean up temporary directory
    try {
      await fs.rm(outputDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  it("should compile dashboard hydration.tsx to valid JavaScript", async () => {
    // Access the private method for testing
    const compileMethod = (
      hydrationManager as unknown as {
        compileHydrationScript: (
          templateName: string,
          packageName: string,
        ) => Promise<void>;
      }
    ).compileHydrationScript.bind(hydrationManager);

    // Compile the dashboard hydration script
    await compileMethod("dashboard", "@brains/dashboard");

    // Verify the output file exists
    const outputFile = join(outputDir, "dashboard-hydration.js");
    const exists = await fs
      .access(outputFile)
      .then(() => true)
      .catch(() => false);

    expect(exists).toBe(true);

    // Verify the output contains expected content
    const content = await fs.readFile(outputFile, "utf8");

    // Should contain window.preact references (from banner and post-processing)
    expect(content).toContain("window.preact");

    // Should contain the hydration function name or marker
    expect(content).toContain("hydrateDashboard");

    // Should contain the component selector
    expect(content).toContain('data-component="dashboard:dashboard"');

    // Should NOT contain raw preact imports (they should be removed)
    expect(content).not.toMatch(/from\s*["']preact["']/);
    expect(content).not.toMatch(/from\s*["']preact\/hooks["']/);
  });

  it("should produce JavaScript that can be parsed without syntax errors", async () => {
    const compileMethod = (
      hydrationManager as unknown as {
        compileHydrationScript: (
          templateName: string,
          packageName: string,
        ) => Promise<void>;
      }
    ).compileHydrationScript.bind(hydrationManager);

    await compileMethod("dashboard", "@brains/dashboard");

    const outputFile = join(outputDir, "dashboard-hydration.js");
    const content = await fs.readFile(outputFile, "utf8");

    // Verify the JavaScript is syntactically valid by attempting to parse it
    // This will throw if there are syntax errors
    expect(() => {
      new Function(content);
    }).not.toThrow();
  });
});
