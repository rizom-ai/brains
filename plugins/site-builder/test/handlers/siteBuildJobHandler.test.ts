import { describe, it, expect, beforeEach, mock } from "bun:test";
import { SiteBuildJobHandler } from "../../src/handlers/siteBuildJobHandler";
import type { ISiteBuilder } from "../../src/types/site-builder-types";
import type { SiteBuilderConfig } from "../../src/config";
import { UISlotRegistry } from "../../src/lib/ui-slot-registry";
import {
  createSilentLogger,
  createMockServicePluginContext,
} from "@brains/test-utils";
import { ProgressReporter } from "@brains/utils";

describe("SiteBuildJobHandler", () => {
  let handler: SiteBuildJobHandler;
  let mockSiteBuilder: ISiteBuilder;

  beforeEach(() => {
    mockSiteBuilder = {
      build: mock(() =>
        Promise.resolve({
          success: true,
          outputDir: "/tmp/output",
          filesGenerated: 10,
          routesBuilt: 10,
        }),
      ),
    };

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

  describe("slot registry", () => {
    it("should pass slot registry to siteBuilder.build()", async () => {
      const slotRegistry = new UISlotRegistry();
      slotRegistry.register("footer-top", {
        pluginId: "newsletter",
        render: () => null,
      });

      let capturedOptions: { slots?: unknown } | undefined;

      const mockSiteBuilderWithSlots: ISiteBuilder = {
        build: async (options) => {
          capturedOptions = options;
          return {
            success: true,
            outputDir: "/tmp/output",
            filesGenerated: 10,
            routesBuilt: 10,
          };
        },
      };

      const mockContext = createMockServicePluginContext();
      const defaultSiteConfig: SiteBuilderConfig["siteInfo"] = {
        title: "Test Site",
        description: "Test Description",
      };

      const handlerWithSlots = new SiteBuildJobHandler(
        createSilentLogger("test"),
        mockSiteBuilderWithSlots,
        {}, // layouts
        defaultSiteConfig,
        mockContext,
        undefined, // entityRouteConfig
        undefined, // themeCSS
        undefined, // previewUrl
        undefined, // productionUrl
        slotRegistry,
      );

      const progressReporter = ProgressReporter.from(async () => {});
      if (!progressReporter) throw new Error("Expected progress reporter");

      await handlerWithSlots.process(
        { outputDir: "/tmp/output" },
        "job-123",
        progressReporter,
      );

      expect(capturedOptions).toBeDefined();
      expect(capturedOptions?.slots).toBe(slotRegistry);
    });
  });
});
