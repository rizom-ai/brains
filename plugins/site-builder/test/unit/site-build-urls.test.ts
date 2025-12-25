import { describe, test, expect, mock, beforeEach } from "bun:test";
import { SiteBuildJobHandler } from "../../src/handlers/siteBuildJobHandler";
import type { ServicePluginContext } from "@brains/plugins";
import type { ISiteBuilder } from "../../src/types/site-builder-types";
import type { ProgressReporter } from "@brains/utils";
import {
  createSilentLogger,
  createMockProgressReporter,
  createMockServicePluginContext,
} from "@brains/test-utils";

describe("SiteBuildJobHandler - Environment URL Selection", () => {
  let mockContext: ServicePluginContext;
  let mockSiteBuilder: ISiteBuilder;
  let mockProgressReporter: ProgressReporter;

  beforeEach(() => {
    mockContext = createMockServicePluginContext();

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

  test("should use productionUrl for production builds", async () => {
    const handler = new SiteBuildJobHandler(
      createSilentLogger(),
      mockSiteBuilder,
      {},
      { title: "Test", description: "Test" },
      mockContext,
      undefined,
      undefined,
      "https://preview.example.com",
      "https://example.com",
    );

    await handler.process(
      {
        environment: "production",
        outputDir: "/tmp/output",
        workingDir: "/tmp/work",
        enableContentGeneration: false,
      },
      "test-job-id",
      mockProgressReporter,
    );

    expect(mockContext.sendMessage).toHaveBeenCalledWith(
      "site:build:completed",
      expect.objectContaining({
        environment: "production",
        siteConfig: expect.objectContaining({
          url: "https://example.com",
        }),
      }),
    );
  });

  test("should use previewUrl for preview builds", async () => {
    const handler = new SiteBuildJobHandler(
      createSilentLogger(),
      mockSiteBuilder,
      {},
      { title: "Test", description: "Test" },
      mockContext,
      undefined,
      undefined,
      "https://preview.example.com",
      "https://example.com",
    );

    await handler.process(
      {
        environment: "preview",
        outputDir: "/tmp/output",
        workingDir: "/tmp/work",
        enableContentGeneration: false,
      },
      "test-job-id",
      mockProgressReporter,
    );

    expect(mockContext.sendMessage).toHaveBeenCalledWith(
      "site:build:completed",
      expect.objectContaining({
        environment: "preview",
        siteConfig: expect.objectContaining({
          url: "https://preview.example.com",
        }),
      }),
    );
  });

  test("should fall back to productionUrl if previewUrl not set", async () => {
    const handler = new SiteBuildJobHandler(
      createSilentLogger(),
      mockSiteBuilder,
      {},
      { title: "Test", description: "Test" },
      mockContext,
      undefined,
      undefined,
      undefined, // No preview URL
      "https://example.com",
    );

    await handler.process(
      {
        environment: "preview",
        outputDir: "/tmp/output",
        workingDir: "/tmp/work",
        enableContentGeneration: false,
      },
      "test-job-id",
      mockProgressReporter,
    );

    expect(mockContext.sendMessage).toHaveBeenCalledWith(
      "site:build:completed",
      expect.objectContaining({
        siteConfig: expect.objectContaining({
          url: "https://example.com",
        }),
      }),
    );
  });

  test("should add https:// prefix if not present", async () => {
    const handler = new SiteBuildJobHandler(
      createSilentLogger(),
      mockSiteBuilder,
      {},
      { title: "Test", description: "Test" },
      mockContext,
      undefined,
      undefined,
      "preview.example.com", // No protocol
      "example.com", // No protocol
    );

    await handler.process(
      {
        environment: "production",
        outputDir: "/tmp/output",
        workingDir: "/tmp/work",
        enableContentGeneration: false,
      },
      "test-job-id",
      mockProgressReporter,
    );

    expect(mockContext.sendMessage).toHaveBeenCalledWith(
      "site:build:completed",
      expect.objectContaining({
        siteConfig: expect.objectContaining({
          url: "https://example.com",
        }),
      }),
    );
  });

  test("should preserve existing http:// or https:// prefix", async () => {
    const handler = new SiteBuildJobHandler(
      createSilentLogger(),
      mockSiteBuilder,
      {},
      { title: "Test", description: "Test" },
      mockContext,
      undefined,
      undefined,
      "http://localhost:4321",
      "https://example.com",
    );

    await handler.process(
      {
        environment: "preview",
        outputDir: "/tmp/output",
        workingDir: "/tmp/work",
        enableContentGeneration: false,
      },
      "test-job-id",
      mockProgressReporter,
    );

    expect(mockContext.sendMessage).toHaveBeenCalledWith(
      "site:build:completed",
      expect.objectContaining({
        siteConfig: expect.objectContaining({
          url: "http://localhost:4321",
        }),
      }),
    );
  });

  test("should set url to undefined if no URLs configured", async () => {
    const handler = new SiteBuildJobHandler(
      createSilentLogger(),
      mockSiteBuilder,
      {},
      { title: "Test", description: "Test" },
      mockContext,
      undefined,
      undefined,
      undefined,
      undefined,
    );

    await handler.process(
      {
        environment: "production",
        outputDir: "/tmp/output",
        workingDir: "/tmp/work",
        enableContentGeneration: false,
      },
      "test-job-id",
      mockProgressReporter,
    );

    expect(mockContext.sendMessage).toHaveBeenCalledWith(
      "site:build:completed",
      expect.objectContaining({
        siteConfig: expect.objectContaining({
          url: undefined,
        }),
      }),
    );
  });
});
