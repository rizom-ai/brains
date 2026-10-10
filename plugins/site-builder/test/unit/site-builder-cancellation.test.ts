import { createTestPipelineContext } from "../pipeline-context";
import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { promises as fs } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { deferred } from "@brains/utils/deferred";
import type { BuildPipelineContext } from "../../src/lib/build-pipeline-context";
import { SiteBuilder } from "../../src/lib/site-builder";
import type { StaticSiteBuilderFactory } from "../../src/lib/static-site-builder";
import {
  createTestSiteBuildOutputLifecycle,
  TestLayout,
} from "../test-helpers";

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

  it("serializes environments sharing a route registry without superseding either", async () => {
    let active = 0;
    let maximum = 0;
    const factory: StaticSiteBuilderFactory = (options) => ({
      clean: async () => undefined,
      build: async (): Promise<void> => {
        active += 1;
        maximum = Math.max(maximum, active);
        try {
          await Bun.sleep(30);
          await fs.mkdir(options.outputDir, { recursive: true });
          await fs.writeFile(join(options.outputDir, "index.html"), "complete");
        } finally {
          active -= 1;
        }
      },
    });
    const pipeline = createPipelineContext();
    const builder = SiteBuilder.createFresh(
      pipeline.logger,
      pipeline.services,
      pipeline.routeRegistry,
      pipeline.profileService,
      factory,
      undefined,
      createTestSiteBuildOutputLifecycle(),
    );
    const results = await Promise.all(
      (["production", "preview"] as const).map((environment) =>
        builder.build({
          environment,
          outputDir: join(testDir, environment),
          sharedImagesDir: join(testDir, "images"),
          enableContentGeneration: false,
          cleanBeforeBuild: true,
          siteConfig: {
            title: "Concurrent startup",
            description: "Shared route registry",
          },
          siteUrl: "https://startup.example",
          layouts: { default: TestLayout },
        }),
      ),
    );
    expect(results.map((result) => result.success)).toEqual([true, true]);
    expect(maximum).toBe(1);
  });

  it("cancels and drains queued environments without starting their renderer", async () => {
    const started = deferred();
    let factoryCalls = 0;
    const factory: StaticSiteBuilderFactory = () => {
      factoryCalls += 1;
      return {
        clean: async () => undefined,
        build: async (_context, _progress, signal): Promise<void> => {
          started.resolve();
          await new Promise<never>((_resolve, reject) => {
            if (signal.aborted) reject(signal.reason);
            else
              signal.addEventListener("abort", () => reject(signal.reason), {
                once: true,
              });
          });
        },
      };
    };
    const pipeline = createPipelineContext();
    const builder = SiteBuilder.createFresh(
      pipeline.logger,
      pipeline.services,
      pipeline.routeRegistry,
      pipeline.profileService,
      factory,
      undefined,
      createTestSiteBuildOutputLifecycle(),
    );
    const options = {
      sharedImagesDir: join(testDir, "images"),
      enableContentGeneration: false,
      siteConfig: { title: "Shutdown", description: "Queued environment" },
      siteUrl: "https://startup.example",
      layouts: { default: TestLayout },
    };
    const first = builder.build({
      ...options,
      environment: "production",
      outputDir: join(testDir, "production"),
    });
    await started.promise;
    const second = builder.build({
      ...options,
      environment: "preview",
      outputDir: join(testDir, "preview"),
    });
    await builder.cancelActiveBuilds();
    const results = await Promise.all([first, second]);
    expect(results.map((result) => result.cancelled)).toEqual([true, true]);
    expect(results.map((result) => result.superseded)).toEqual([
      undefined,
      undefined,
    ]);
    expect(factoryCalls).toBe(1);
  });

  it.each([false, true])(
    "cleans replaced builds without hiding prior caller cancellation (%s)",
    async (callerCancelled) => {
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
            await fs.writeFile(
              join(options.outputDir, "index.html"),
              "complete",
            );
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

      const caller = new AbortController();
      const firstPromise = builder.build({
        ...buildOptions,
        signal: caller.signal,
      });
      await firstStarted;
      if (callerCancelled) caller.abort(new Error("Caller stopped"));
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
      expect(firstResult.superseded).toBe(callerCancelled ? undefined : true);
      expect(firstResult.errors?.[0]).toContain(
        callerCancelled
          ? "Caller stopped"
          : "Superseded by a newer preview site build",
      );
      expect(secondResult.success).toBe(true);
      expect(
        (await fs.readdir(testDir)).filter((name) =>
          name.includes(".generation-"),
        ),
      ).toEqual([]);
    },
  );
});
