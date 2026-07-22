import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { RouteRegistry } from "@brains/site-engine";
import {
  createMockServicePluginContext,
  createSilentLogger,
} from "@brains/test-utils";
import { promises as fs } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import type { BuildPipelineContext } from "../../src/lib/build-pipeline-context";
import { runSiteBuild } from "../../src/lib/run-site-build";
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

describe("runSiteBuild transactional output", () => {
  let testDir: string;
  let outputDir: string;

  beforeEach(async () => {
    testDir = await fs.mkdtemp(join(tmpdir(), "run-site-build-transaction-"));
    outputDir = join(testDir, "site-preview");
  });

  afterEach(async () => {
    await fs.rm(testDir, { recursive: true, force: true });
  });

  it("keeps the last successful output active after a late renderer failure", async () => {
    const successfulFactory: StaticSiteBuilderFactory = (options) => ({
      clean: mock(async () => undefined),
      build: mock(async () => {
        await fs.mkdir(join(options.outputDir, "styles"), { recursive: true });
        await fs.writeFile(
          join(options.outputDir, "index.html"),
          "stable output",
        );
        await fs.writeFile(
          join(options.outputDir, "styles/main.css"),
          "body{}",
        );
      }),
    });
    const buildOptions = {
      environment: "preview" as const,
      outputDir,
      sharedImagesDir: join(testDir, "images"),
      enableContentGeneration: false,
      cleanBeforeBuild: true,
      siteConfig: {
        title: "Transactional Site",
        description: "Transactional fixture",
      },
      layouts: { default: TestLayout },
    };

    const firstResult = await runSiteBuild({
      buildOptions,
      progress: undefined,
      pipelineContext: createPipelineContext(),
      staticSiteBuilderFactory: successfulFactory,
      signal: new AbortController().signal,
    });

    expect(firstResult.success).toBe(true);
    expect(await fs.readFile(join(outputDir, "index.html"), "utf8")).toBe(
      "stable output",
    );
    expect(await fs.readFile(join(outputDir, "robots.txt"), "utf8")).toContain(
      "Sitemap: https://example.com/sitemap.xml",
    );
    expect(
      await fs.readFile(join(outputDir, ".site-build-manifest.json"), "utf8"),
    ).toContain('"kind": "seo"');

    const failingFactory: StaticSiteBuilderFactory = (options) => ({
      clean: mock(async () => undefined),
      build: mock(async () => {
        await fs.writeFile(
          join(options.outputDir, "index.html"),
          "partial replacement",
        );
        throw new Error("late renderer failure");
      }),
    });
    const failedResult = await runSiteBuild({
      buildOptions,
      progress: undefined,
      pipelineContext: createPipelineContext(),
      staticSiteBuilderFactory: failingFactory,
      signal: new AbortController().signal,
    });

    expect(failedResult).toMatchObject({
      success: false,
      errors: [
        "[build-failed] Site build process failed: late renderer failure",
      ],
    });
    expect(await fs.readFile(join(outputDir, "index.html"), "utf8")).toBe(
      "stable output",
    );

    const invalidFactory: StaticSiteBuilderFactory = (options) => ({
      clean: mock(async () => undefined),
      build: mock(async () => {
        await fs.writeFile(
          join(options.outputDir, "index.html"),
          "unvalidated replacement",
        );
      }),
    });
    const invalidResult = await runSiteBuild({
      buildOptions,
      progress: undefined,
      pipelineContext: createPipelineContext(),
      staticSiteBuilderFactory: invalidFactory,
      signal: new AbortController().signal,
    });

    expect(invalidResult).toMatchObject({
      success: false,
      errors: [
        "[output-commit-failed] Site output commit failed: Expected CSS artifact is missing: styles/main.css",
      ],
      diagnostics: [expect.objectContaining({ code: "output-commit-failed" })],
    });
    expect(await fs.readFile(join(outputDir, "index.html"), "utf8")).toBe(
      "stable output",
    );
    expect((await fs.lstat(outputDir)).isSymbolicLink()).toBe(true);
    const generations = await fs.readdir(
      join(testDir, ".site-builds", "preview"),
    );
    expect(generations).toHaveLength(1);
  });

  it("treats the bounded output commit section as non-interruptible", async () => {
    const controller = new AbortController();
    const lifecycle = createTestSiteBuildOutputLifecycle();
    const commit = lifecycle.commit;
    lifecycle.commit = async (options): ReturnType<typeof commit> => {
      controller.abort(new Error("cancel arrived during commit"));
      return commit(options);
    };
    const result = await runSiteBuild({
      buildOptions: {
        environment: "preview",
        outputDir,
        sharedImagesDir: join(testDir, "images"),
        enableContentGeneration: false,
        cleanBeforeBuild: true,
        siteConfig: {
          title: "Commit Site",
          description: "Commit fixture",
        },
        layouts: { default: TestLayout },
      },
      progress: undefined,
      pipelineContext: createPipelineContext(),
      staticSiteBuilderFactory: () => ({
        clean: mock(async () => undefined),
        build: mock(async () => undefined),
      }),
      outputLifecycle: lifecycle,
      signal: controller.signal,
    });

    expect(result).toMatchObject({ success: true });
    expect(result.cancelled).toBeUndefined();
  });

  it("cleans cancelled staging without replacing the active generation", async () => {
    const buildOptions = {
      environment: "preview" as const,
      outputDir,
      sharedImagesDir: join(testDir, "images"),
      enableContentGeneration: false,
      cleanBeforeBuild: true,
      siteConfig: {
        title: "Cancellation Site",
        description: "Cancellation fixture",
      },
      layouts: { default: TestLayout },
    };
    const successfulFactory: StaticSiteBuilderFactory = (options) => ({
      clean: mock(async () => undefined),
      build: mock(async () => {
        await fs.mkdir(join(options.outputDir, "styles"), { recursive: true });
        await fs.writeFile(join(options.outputDir, "index.html"), "stable");
        await fs.writeFile(
          join(options.outputDir, "styles/main.css"),
          "body{}",
        );
      }),
    });
    expect(
      (
        await runSiteBuild({
          buildOptions,
          progress: undefined,
          pipelineContext: createPipelineContext(),
          staticSiteBuilderFactory: successfulFactory,
          signal: new AbortController().signal,
        })
      ).success,
    ).toBe(true);

    const controller = new AbortController();
    const cancellingFactory: StaticSiteBuilderFactory = (options) => ({
      clean: mock(async () => undefined),
      build: mock(async (_context, _onProgress, signal) => {
        await fs.writeFile(join(options.outputDir, "index.html"), "partial");
        controller.abort(new Error("operator cancelled build"));
        signal.throwIfAborted();
      }),
    });
    const cancelled = await runSiteBuild({
      buildOptions,
      progress: undefined,
      pipelineContext: createPipelineContext(),
      staticSiteBuilderFactory: cancellingFactory,
      signal: controller.signal,
    });

    expect(cancelled).toMatchObject({
      success: false,
      cancelled: true,
      errors: [
        "[build-cancelled] Site build cancelled: operator cancelled build",
      ],
      diagnostics: [expect.objectContaining({ code: "build-cancelled" })],
    });
    expect(await fs.readFile(join(outputDir, "index.html"), "utf8")).toBe(
      "stable",
    );
    expect(
      await fs.readdir(join(testDir, ".site-builds", "preview")),
    ).toHaveLength(1);
  });
});
