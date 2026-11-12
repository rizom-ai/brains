import { describe, test, expect, beforeEach, mock } from "bun:test";
import { messagingFor } from "../test-helpers";
import type { SiteBuildJobHandlerConfig } from "../../src/handlers/siteBuildJobHandler";
import {
  createSiteBuildJobHandler,
  type SiteBuildTestHandler,
} from "../site-build-job";
import type { ISiteBuilder } from "../../src/types/site-builder-types";
import type { ProgressReporter } from "@brains/utils/progress";
import {
  createSilentLogger,
  createMockProgressReporter,
} from "@brains/test-utils";

type SiteBuildJobHandlerConfigOverrides = Partial<SiteBuildJobHandlerConfig>;

/**
 * Tests that SiteBuildTestHandler resolves canonical, preview, and local URLs
 * from the runtime context passed through its config.
 */
describe("SiteBuildTestHandler - Domain URLs", () => {
  let mockSiteBuilder: ISiteBuilder;
  let mockProgressReporter: ProgressReporter;

  beforeEach(() => {
    mockSiteBuilder = {
      build: mock(() =>
        Promise.resolve({
          success: true,
          outputDir: "/tmp/output",
          filesGenerated: 5,
          routesBuilt: 5,
          errors: [],
          warnings: [],
        }),
      ),
    };
    mockProgressReporter = createMockProgressReporter();
  });

  function createHandler(
    overrides: SiteBuildJobHandlerConfigOverrides = {},
  ): SiteBuildTestHandler {
    return createSiteBuildJobHandler(createSilentLogger(), messagingFor(), {
      siteBuilder: mockSiteBuilder,
      layouts: {},
      defaultSiteConfig: {
        represents: "anchor",
        title: "Test",
        description: "Test",
      },
      sharedImagesDir: "./dist/images",
      ...overrides,
    });
  }

  const buildData = {
    outputDir: "/tmp/output",
    workingDir: "/tmp/work",
    enableContentGeneration: false,
  };

  test("should use siteUrl for production builds", async () => {
    const handler = createHandler({
      siteUrl: "https://yeehaa.io",
      previewUrl: "https://preview.yeehaa.io",
    });

    await handler.process(
      { ...buildData, environment: "production" },
      "test-job-id",
      mockProgressReporter,
    );

    expect(mockSiteBuilder.build).toHaveBeenCalledWith(
      expect.objectContaining({ siteUrl: "https://yeehaa.io" }),
      expect.anything(),
    );
  });

  test("should use previewUrl for preview builds", async () => {
    const handler = createHandler({
      siteUrl: "https://yeehaa.io",
      previewUrl: "https://preview.yeehaa.io",
    });

    await handler.process(
      { ...buildData, environment: "preview" },
      "test-job-id",
      mockProgressReporter,
    );

    expect(mockSiteBuilder.build).toHaveBeenCalledWith(
      expect.objectContaining({ siteUrl: "https://preview.yeehaa.io" }),
      expect.anything(),
    );
  });

  test("should fall back to siteUrl for preview when previewUrl is not set", async () => {
    const handler = createHandler({
      siteUrl: "https://yeehaa.io",
    });

    await handler.process(
      { ...buildData, environment: "preview" },
      "test-job-id",
      mockProgressReporter,
    );

    expect(mockSiteBuilder.build).toHaveBeenCalledWith(
      expect.objectContaining({ siteUrl: "https://yeehaa.io" }),
      expect.anything(),
    );
  });

  test("should use the local runtime URL for local production builds", async () => {
    const handler = createHandler({
      localSiteUrl: "http://localhost:8080",
      preferLocalUrls: true,
    });

    await handler.process(
      { ...buildData, environment: "production" },
      "test-job-id",
      mockProgressReporter,
    );

    expect(mockSiteBuilder.build).toHaveBeenCalledWith(
      expect.objectContaining({ siteUrl: "http://localhost:8080" }),
      expect.anything(),
    );
  });

  test("should not use the local runtime URL in deployed production", async () => {
    const handler = createHandler({
      localSiteUrl: "http://localhost:8080",
      preferLocalUrls: false,
    });

    await handler.process(
      { ...buildData, environment: "production" },
      "test-job-id",
      mockProgressReporter,
    );

    expect(mockSiteBuilder.build).toHaveBeenCalledWith(
      expect.objectContaining({ siteUrl: undefined }),
      expect.anything(),
    );
  });
});
