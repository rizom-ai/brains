import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { promises as fs } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { HydrationManager } from "../../src/hydration/hydration-manager";
import { createSilentLogger } from "@brains/test-utils";
import type { ViewTemplate } from "@brains/plugins";

describe("HydrationManager - writes pre-compiled hydration scripts", () => {
  let outputDir: string;
  let hydrationManager: HydrationManager;
  const MOCK_HYDRATION_JS = '(function() { console.log("hydrated"); })();';

  beforeEach(async () => {
    outputDir = join(tmpdir(), `hydration-test-${Date.now()}`);
    await fs.mkdir(outputDir, { recursive: true });

    // Write a dummy HTML file for the dashboard route
    const dashboardDir = join(outputDir, "dashboard");
    await fs.mkdir(dashboardDir, { recursive: true });
    await fs.writeFile(
      join(dashboardDir, "index.html"),
      '<html><head></head><body><div data-component="dashboard:dashboard"></div></body></html>',
      "utf8",
    );

    const logger = createSilentLogger("hydration-test");
    const mockGetViewTemplate = (name: string): ViewTemplate | undefined => {
      if (name === "dashboard:dashboard") {
        return {
          name: "dashboard:dashboard",
          schema: {} as ViewTemplate["schema"],
          pluginId: "dashboard",
          renderers: {},
          interactive: MOCK_HYDRATION_JS,
        };
      }
      return undefined;
    };

    hydrationManager = new HydrationManager(
      logger,
      mockGetViewTemplate,
      outputDir,
    );
  });

  afterEach(async () => {
    try {
      await fs.rm(outputDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  it("should write pre-compiled hydration script to output directory", async () => {
    const routes = [
      {
        id: "dashboard",
        path: "/dashboard",
        title: "Dashboard",
        description: "Dashboard",
        layout: "default",
        sections: [
          {
            id: "main",
            template: "dashboard:dashboard",
            content: { widgets: {} },
          },
        ],
      },
    ];

    await hydrationManager.updateHTMLFiles(routes);

    const outputFile = join(outputDir, "dashboard-hydration.js");
    const exists = await fs
      .access(outputFile)
      .then(() => true)
      .catch(() => false);
    expect(exists).toBe(true);

    const content = await fs.readFile(outputFile, "utf8");
    expect(content).toBe(MOCK_HYDRATION_JS);
  });

  it("should inject Preact scripts and hydration reference into HTML", async () => {
    const routes = [
      {
        id: "dashboard",
        path: "/dashboard",
        title: "Dashboard",
        description: "Dashboard",
        layout: "default",
        sections: [
          {
            id: "main",
            template: "dashboard:dashboard",
            content: { widgets: {} },
          },
        ],
      },
    ];

    await hydrationManager.updateHTMLFiles(routes);

    const html = await fs.readFile(
      join(outputDir, "dashboard", "index.html"),
      "utf8",
    );
    expect(html).toContain("preact.min.js");
    expect(html).toContain("dashboard-hydration.js");
    expect(html).toContain("data-dashboard-props");
  });
});
