import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { RouteRegistry } from "@brains/site-engine";
import {
  createMockServicePluginContext,
  createSilentLogger,
} from "@brains/test-utils";
import { promises as fs } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import type { BuildPipelineContext } from "../../src/lib/build-pipeline-context";
import { SiteBuilder } from "../../src/lib/site-builder";
import type { StaticSiteBuilderFactory } from "../../src/lib/static-site-builder";
import {
  createSiteBuilderServices,
  createTestSiteBuildOutputLifecycle,
  TestLayout,
} from "../test-helpers";

function createPipelineContext(): BuildPipelineContext {
  const logger = createSilentLogger();
  const context = createMockServicePluginContext({ logger });
  const routeRegistry = new RouteRegistry(logger);
  routeRegistry.register({
    id: "home",
    path: "/",
    title: "Home",
    description: "Home route",
    layout: "default",
    sections: [],
  });
  return {
    logger,
    services: createSiteBuilderServices(context),
    routeRegistry,
    profileService: { getProfile: () => ({}) },
    entityDisplay: undefined,
  };
}

describe("SiteBuilder cancellation", () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = await fs.mkdtemp(join(tmpdir(), "site-builder-cancellation-"));
  });

  afterEach(async () => {
    await fs.rm(testDir, { recursive: true, force: true });
  });

  it("cancels and cleans a superseded build before publishing the newer build", async () => {
    let factoryCalls = 0;
    let markFirstStarted: (() => void) | undefined;
    const firstStarted = new Promise<void>((resolve) => {
      markFirstStarted = resolve;
    });
    const factory: StaticSiteBuilderFactory = (options) => {
      factoryCalls += 1;
      const buildNumber = factoryCalls;
      return {
        clean: async () => undefined,
        build: async (_context, _onProgress, signal): Promise<void> => {
          await fs.mkdir(options.outputDir, { recursive: true });
          if (buildNumber === 1) {
            await fs.writeFile(
              join(options.outputDir, "partial.html"),
              "partial",
            );
            markFirstStarted?.();
            await new Promise<never>((_resolve, reject) => {
              if (signal.aborted) {
                reject(signal.reason);
                return;
              }
              signal.addEventListener("abort", () => reject(signal.reason), {
                once: true,
              });
            });
          }
          await fs.writeFile(join(options.outputDir, "index.html"), "complete");
        },
      };
    };
    const pipelineContext = createPipelineContext();
    const builder = SiteBuilder.createFresh(
      pipelineContext.logger,
      pipelineContext.services,
      pipelineContext.routeRegistry,
      pipelineContext.profileService,
      factory,
      undefined,
      createTestSiteBuildOutputLifecycle(),
    );
    const buildOptions = {
      environment: "preview" as const,
      outputDir: join(testDir, "site-preview"),
      sharedImagesDir: join(testDir, "images"),
      enableContentGeneration: false,
      cleanBeforeBuild: true,
      siteConfig: {
        title: "Cancellation Site",
        description: "Cancellation fixture",
      },
      siteUrl: undefined,
      layouts: { default: TestLayout },
    };

    const firstPromise = builder.build(buildOptions);
    await firstStarted;
    const secondPromise = builder.build(buildOptions);
    const [firstResult, secondResult] = await Promise.all([
      firstPromise,
      secondPromise,
    ]);

    expect(firstResult).toMatchObject({
      success: false,
      cancelled: true,
      diagnostics: [expect.objectContaining({ code: "build-cancelled" })],
    });
    expect(firstResult.errors?.[0]).toContain(
      "Superseded by a newer preview site build",
    );
    expect(secondResult.success).toBe(true);
    expect(
      (await fs.readdir(testDir)).filter((name) =>
        name.includes(".generation-"),
      ),
    ).toEqual([]);
  });
});
