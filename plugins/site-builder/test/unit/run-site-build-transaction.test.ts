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
import { createSiteBuilderServices, TestLayout } from "../test-helpers";

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
});
