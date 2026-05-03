import { describe, test, expect, beforeEach, mock } from "bun:test";
import {
  SiteBuildJobHandler,
  type SiteBuildJobHandlerConfig,
} from "../../src/handlers/siteBuildJobHandler";
import type { ISiteBuilder } from "../../src/types/site-builder-types";
import type { ProgressReporter } from "@brains/utils";
import {
  createSilentLogger,
  createMockProgressReporter,
  createMockMessageSender,
} from "@brains/test-utils";

/**
 * Tests that SiteBuildJobHandler uses siteUrl/previewUrl from its config
 * (which the plugin populates from context.siteUrl/context.previewUrl).
 */
describe("SiteBuildJobHandler - Domain URLs", () => {
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

  function createHandler(overrides: Partial<SiteBuildJobHandlerConfig> = {}): {
    handler: SiteBuildJobHandler;
    sendMessage: ReturnType<typeof mock>;
  } {
    const { sendMessage } = createMockMessageSender();
    const handler = new SiteBuildJobHandler(createSilentLogger(), sendMessage, {
      siteBuilder: mockSiteBuilder,
      layouts: {},
      defaultSiteConfig: { title: "Test", description: "Test" },
      sharedImagesDir: "./dist/images",
      ...overrides,
    });
    return { handler, sendMessage };
  }

  const buildData = {
    outputDir: "/tmp/output",
    workingDir: "/tmp/work",
    enableContentGeneration: false,
  };

  test("should use siteUrl for production builds", async () => {
    const { handler, sendMessage } = createHandler({
      siteUrl: "https://yeehaa.io",
      previewUrl: "https://preview.yeehaa.io",
    });

    await handler.process(
      { ...buildData, environment: "production" },
      "test-job-id",
      mockProgressReporter,
    );

    expect(sendMessage).toHaveBeenCalledWith({
      type: "site:build:completed",
      payload: expect.objectContaining({
        environment: "production",
        siteConfig: expect.objectContaining({
          url: "https://yeehaa.io",
        }),
      }),
      broadcast: true,
    });
  });

  test("should use previewUrl for preview builds", async () => {
    const { handler, sendMessage } = createHandler({
      siteUrl: "https://yeehaa.io",
      previewUrl: "https://preview.yeehaa.io",
    });

    await handler.process(
      { ...buildData, environment: "preview" },
      "test-job-id",
      mockProgressReporter,
    );

    expect(sendMessage).toHaveBeenCalledWith({
      type: "site:build:completed",
      payload: expect.objectContaining({
        environment: "preview",
        siteConfig: expect.objectContaining({
          url: "https://preview.yeehaa.io",
        }),
      }),
      broadcast: true,
    });
  });

  test("should fall back to siteUrl for preview when previewUrl is not set", async () => {
    const { handler, sendMessage } = createHandler({
      siteUrl: "https://yeehaa.io",
    });

    await handler.process(
      { ...buildData, environment: "preview" },
      "test-job-id",
      mockProgressReporter,
    );

    expect(sendMessage).toHaveBeenCalledWith({
      type: "site:build:completed",
      payload: expect.objectContaining({
        siteConfig: expect.objectContaining({
          url: "https://yeehaa.io",
        }),
      }),
      broadcast: true,
    });
  });

  test("should set url to undefined when no URLs configured", async () => {
    const { handler, sendMessage } = createHandler();

    await handler.process(
      { ...buildData, environment: "production" },
      "test-job-id",
      mockProgressReporter,
    );

    expect(sendMessage).toHaveBeenCalledWith({
      type: "site:build:completed",
      payload: expect.objectContaining({
        siteConfig: expect.objectContaining({
          url: undefined,
        }),
      }),
      broadcast: true,
    });
  });
});
