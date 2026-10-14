import { createTestPipelineContext } from "../pipeline-context";
import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { promises as fs } from "fs";
import { tmpdir } from "os";
import { basename, join } from "path";
import type { BuildPipelineContext } from "../../src/lib/build-pipeline-context";
import { SiteBuilder } from "../../src/lib/site-builder";
import type { StaticSiteBuilderFactory } from "../../src/lib/static-site-builder";
import {
  createTestSiteBuildOutputLifecycle,
  TestLayout,
} from "../test-helpers";

/**
 * A build that waits its turn does nothing observable, so the test can only
 * give an eager one real time to start before checking that none did.
 */
const giveAnEagerBuildTimeToStart = (): Promise<void> => Bun.sleep(20);

function createPipelineContext(): BuildPipelineContext {
  return createTestPipelineContext().pipeline;
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
      siteUrl: "https://cancellation.example",
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
      superseded: true,
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

  it("builds one environment at a time, so two builds never share the memory", async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    const started: string[] = [];
    let releaseFirst: (() => void) | undefined;
    const firstHeld = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    let markFirstStarted: (() => void) | undefined;
    const firstStarted = new Promise<void>((resolve) => {
      markFirstStarted = resolve;
    });
    const factory: StaticSiteBuilderFactory = (options) => ({
      clean: async () => undefined,
      build: async (): Promise<void> => {
        inFlight += 1;
        maxInFlight = Math.max(maxInFlight, inFlight);
        started.push(options.outputDir);
        await fs.mkdir(options.outputDir, { recursive: true });
        if (started.length === 1) {
          markFirstStarted?.();
          await firstHeld;
        }
        await fs.writeFile(join(options.outputDir, "index.html"), "complete");
        inFlight -= 1;
      },
    });
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
    const optionsFor = (
      environment: "preview" | "production",
    ): Parameters<typeof builder.build>[0] => ({
      environment,
      outputDir: join(testDir, `site-${environment}`),
      sharedImagesDir: join(testDir, "images"),
      enableContentGeneration: false,
      cleanBeforeBuild: true,
      siteConfig: { title: "Turn Site", description: "Turn fixture" },
      siteUrl: "https://turn.example",
      layouts: { default: TestLayout },
    });

    const preview = builder.build(optionsFor("preview"));
    await firstStarted;
    const production = builder.build(optionsFor("production"));
    // Production waits its turn while preview is still building.
    await giveAnEagerBuildTimeToStart();
    expect(started).toHaveLength(1);
    releaseFirst?.();
    const results = await Promise.all([preview, production]);

    expect(results.map((result) => result.success)).toEqual([true, true]);
    expect(maxInFlight).toBe(1);
    // Each build writes a generation of its site: preview first, then production.
    expect(
      started.map((dir) => basename(dir).split(".generation-")[0]),
    ).toEqual(["site-preview", "site-production"]);
  });
});
