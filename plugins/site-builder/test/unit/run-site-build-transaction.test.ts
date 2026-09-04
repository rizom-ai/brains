import { createTestPipelineContext } from "../pipeline-context";
import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { SITE_CHANNELS } from "@brains/contracts";
import { promises as fs } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import type { BuildPipelineContext } from "../../src/lib/build-pipeline-context";
import { runSiteBuild } from "../../src/lib/run-site-build";
import type { StaticSiteBuilderFactory } from "../../src/lib/static-site-builder";
import {
  createTestSiteBuildOutputLifecycle,
  TestLayout,
} from "../test-helpers";

function createPipelineContext(): BuildPipelineContext {
  return createTestPipelineContext().pipeline;
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
      siteUrl: "https://transaction.example",
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
      "Sitemap: https://transaction.example/sitemap.xml",
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

  it("skips rendering when the prepared site input fingerprint is unchanged", async () => {
    let renderCount = 0;
    const factory: StaticSiteBuilderFactory = (options) => ({
      clean: mock(async () => undefined),
      build: mock(async () => {
        renderCount += 1;
        await fs.mkdir(join(options.outputDir, "styles"), { recursive: true });
        await fs.writeFile(join(options.outputDir, "index.html"), "stable");
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
        title: "Fingerprint Site",
        description: "Fingerprint fixture",
      },
      siteUrl: "https://fingerprint.example",
      layouts: { default: TestLayout },
    };

    const first = await runSiteBuild({
      buildOptions,
      progress: undefined,
      pipelineContext: createPipelineContext(),
      staticSiteBuilderFactory: factory,
      signal: new AbortController().signal,
    });
    const second = await runSiteBuild({
      buildOptions,
      progress: undefined,
      pipelineContext: createPipelineContext(),
      staticSiteBuilderFactory: factory,
      signal: new AbortController().signal,
    });

    expect(first.success).toBe(true);
    expect(second).toMatchObject({ success: true, skipped: true });
    expect(renderCount).toBe(1);
    expect(
      JSON.parse(
        await fs.readFile(join(outputDir, ".site-build-manifest.json"), "utf8"),
      ).inputFingerprint,
    ).toMatch(/^[a-f0-9]{64}$/);
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
        siteUrl: undefined,
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
      siteUrl: "https://cancellation.example",
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

  it("reports a staged SEO write failure as a build failure, not a commit failure", async () => {
    // SEO artifacts are written into staging, before the generation is
    // validated or published, so a failure there has not reached the commit.
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
      siteUrl: "https://seo.example",
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

    // Occupying the robots.txt path with a directory makes the staged write
    // fail with EISDIR through the real code path.
    const blockingFactory: StaticSiteBuilderFactory = (options) => ({
      clean: mock(async () => undefined),
      build: mock(async () => {
        await fs.mkdir(join(options.outputDir, "styles"), { recursive: true });
        await fs.writeFile(join(options.outputDir, "index.html"), "blocked");
        await fs.writeFile(
          join(options.outputDir, "styles/main.css"),
          "body{}",
        );
        await fs.mkdir(join(options.outputDir, "robots.txt"), {
          recursive: true,
        });
      }),
    });
    const result = await runSiteBuild({
      buildOptions,
      progress: undefined,
      pipelineContext: createPipelineContext(),
      staticSiteBuilderFactory: blockingFactory,
      signal: new AbortController().signal,
    });

    expect(result.success).toBe(false);
    expect(result.diagnostics).toEqual([
      expect.objectContaining({ code: "build-failed" }),
    ]);
    expect(await fs.readFile(join(outputDir, "index.html"), "utf8")).toBe(
      "stable",
    );
    expect(
      await fs.readdir(join(testDir, ".site-builds", "preview")),
    ).toHaveLength(1);
  });

  it("fails the build when a staging subscriber reports a failed artifact", async () => {
    // Staging artifacts are produced by broadcast subscribers, and the message
    // bus swallows their errors. Without a reported failure the generation
    // would publish with the artifact missing and still report success.
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
      siteUrl: "https://staging.example",
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

    const baseContext = createPipelineContext();
    const reportingContext: BuildPipelineContext = {
      ...baseContext,
      services: {
        ...baseContext.services,
        sendMessage: async (request) => {
          if (request.type === SITE_CHANNELS.buildStaging) {
            // Checked rather than asserted: the staging payload carries a
            // callback, and a build that stopped supplying one would otherwise
            // fail here with "not a function" rather than saying so.
            const payload = request.payload;
            if (typeof payload !== "object" || payload === null) {
              throw new Error("Expected a staging payload object");
            }
            const reportFailure = Reflect.get(payload, "reportFailure");
            if (typeof reportFailure !== "function") {
              throw new Error("Staging payload carried no reportFailure");
            }
            reportFailure("RSS feed generation failed: ENOENT");
          }
          return baseContext.services.sendMessage(request);
        },
      },
    };

    const result = await runSiteBuild({
      buildOptions,
      progress: undefined,
      pipelineContext: reportingContext,
      staticSiteBuilderFactory: successfulFactory,
      signal: new AbortController().signal,
    });

    expect(result).toMatchObject({
      success: false,
      errors: [
        "[staged-artifact-failed] Staged site artifact failed: RSS feed generation failed: ENOENT",
      ],
      diagnostics: [
        expect.objectContaining({ code: "staged-artifact-failed" }),
      ],
    });
    expect(await fs.readFile(join(outputDir, "index.html"), "utf8")).toBe(
      "stable",
    );
    expect(
      await fs.readdir(join(testDir, ".site-builds", "preview")),
    ).toHaveLength(1);
  });
});
