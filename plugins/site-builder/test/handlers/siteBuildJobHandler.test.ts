import { describe, it, expect, beforeEach, mock } from "bun:test";
import { SiteBuildJobHandler } from "../../src/handlers/siteBuildJobHandler";
import type { SiteBuilder } from "../../src/lib/site-builder";
import type { SiteBuilderConfig } from "../../src/config";
import {
  createSilentLogger,
  createMockServicePluginContext,
} from "@brains/test-utils";

describe("SiteBuildJobHandler", () => {
  let handler: SiteBuildJobHandler;
  let mockSiteBuilder: SiteBuilder;

  beforeEach(() => {
    mockSiteBuilder = {
      build: mock(() =>
        Promise.resolve({
          success: true,
          routesBuilt: 10,
        }),
      ),
    } as unknown as SiteBuilder;

    const mockContext = createMockServicePluginContext();

    const defaultSiteConfig: SiteBuilderConfig["siteInfo"] = {
      title: "Test Site",
      description: "Test Description",
    };

    handler = new SiteBuildJobHandler(
      createSilentLogger("test"),
      mockSiteBuilder,
      {}, // layouts
      defaultSiteConfig,
      mockContext,
    );
  });

  describe("validateAndParse", () => {
    it("should validate minimal required fields", () => {
      const data = {
        outputDir: "/path/to/output",
      };
      const result = handler.validateAndParse(data);

      expect(result).not.toBeNull();
      expect(result?.outputDir).toBe("/path/to/output");
      // Optional fields are undefined until defaults are applied in process()
      expect(result?.environment).toBeUndefined();
      expect(result?.enableContentGeneration).toBeUndefined();
    });

    it("should validate with all fields", () => {
      const data = {
        outputDir: "/path/to/output",
        workingDir: "/path/to/working",
        environment: "production",
        enableContentGeneration: true,
        siteConfig: {
          title: "Custom Title",
          description: "Custom Description",
        },
      };
      const result = handler.validateAndParse(data);

      expect(result).not.toBeNull();
      expect(result?.outputDir).toBe("/path/to/output");
      expect(result?.workingDir).toBe("/path/to/working");
      expect(result?.environment).toBe("production");
      expect(result?.enableContentGeneration).toBe(true);
      expect(result?.siteConfig?.title).toBe("Custom Title");
    });

    it("should return null for missing outputDir", () => {
      const result = handler.validateAndParse({});
      expect(result).toBeNull();
    });

    it("should return null for invalid environment", () => {
      const result = handler.validateAndParse({
        outputDir: "/path",
        environment: "invalid",
      });
      expect(result).toBeNull();
    });

    it("should allow undefined environment (defaults applied in process)", () => {
      const data = { outputDir: "/path/to/output" };
      const result = handler.validateAndParse(data);

      expect(result).not.toBeNull();
      expect(result?.environment).toBeUndefined();
    });

    it("should allow undefined enableContentGeneration (defaults applied in process)", () => {
      const data = { outputDir: "/path/to/output" };
      const result = handler.validateAndParse(data);

      expect(result).not.toBeNull();
      expect(result?.enableContentGeneration).toBeUndefined();
    });
  });
});
