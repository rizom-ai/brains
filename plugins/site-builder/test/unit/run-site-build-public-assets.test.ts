import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import assert from "node:assert/strict";
import {
  mkdtemp,
  mkdir,
  writeFile,
  readFile,
  rm,
  symlink,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type {
  EntityFileRuntime,
  EntityFileProductionOptions,
  EntityVerifiedFileSource,
} from "@brains/entity-service";
import { createPublicAssetRuntime } from "../public-asset-runtime";
import { createTestPipelineContext } from "../pipeline-context";
import { TestLayout } from "../test-helpers";
import { MockCSSProcessor } from "../mocks/mock-css-processor";
import { createReactBuilder } from "../../src/lib/react-builder";
import type { StaticSiteBuilder } from "../../src/lib/static-site-builder";
import {
  runSiteBuild,
  type RunSiteBuildOptions,
} from "../../src/lib/run-site-build";

describe("production site pipeline with owned public files", () => {
  let directory: string;
  let publicDir: string;
  let outputDir: string;
  let runtime: EntityFileRuntime;
  let snapshotFile: string | undefined;
  let retirementFailure: Error | undefined;
  let options: RunSiteBuildOptions;
  let renders: number;
  let beforeRender: (() => Promise<void>) | undefined;
  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), "site-public-pipeline-"));
    publicDir = join(directory, "public");
    outputDir = join(directory, "site-preview");
    await mkdir(publicDir);
    runtime = createPublicAssetRuntime();
    snapshotFile = undefined;
    retirementFailure = undefined;
    beforeRender = undefined;
    renders = 0;
    const produce = runtime.withProducedFile.bind(runtime);
    runtime.withProducedFile = <T>(
      source: string | undefined,
      use: (file: EntityVerifiedFileSource, signal: AbortSignal) => Promise<T>,
      settings?: EntityFileProductionOptions,
    ): Promise<T> =>
      produce(
        source,
        async (file, signal): Promise<T> => {
          const capturing = settings?.metadata?.["mode"] === "snapshot";
          if (capturing) snapshotFile = file.sourceFile;
          const result = await use(file, signal);
          if (capturing && retirementFailure) throw retirementFailure;
          return result;
        },
        settings,
      );
    const { pipeline } = createTestPipelineContext();
    pipeline.services.entityService.fileAssets = runtime;
    options = {
      publicDir,
      pipelineContext: pipeline,
      progress: undefined,
      signal: new AbortController().signal,
      buildOptions: {
        environment: "preview",
        outputDir,
        sharedImagesDir: join(directory, "images"),
        enableContentGeneration: false,
        cleanBeforeBuild: true,
        siteConfig: { title: "Native public files", description: "Fixture" },
        siteUrl: "https://example.test",
        layouts: { default: TestLayout },
      },
      staticSiteBuilderFactory: (configuration): StaticSiteBuilder => {
        const renderer = createReactBuilder({
          ...configuration,
          cssProcessor: new MockCSSProcessor(),
        });
        return {
          clean: (): Promise<void> => renderer.clean(),
          build: async (context, report, signal): Promise<void> => {
            renders++;
            await beforeRender?.();
            await renderer.build(context, report, signal);
          },
        };
      },
    };
  });
  afterEach(async () => {
    await runtime.close();
    await rm(directory, { recursive: true });
  });

  test("renders from captured files after the source disappears, then skips unchanged inputs", async () => {
    const bytes = new Uint8Array(96 * 1024 + 7).fill(77);
    await writeFile(join(publicDir, "binary.dat"), bytes);
    beforeRender = async (): Promise<void> => {
      assert.ok(snapshotFile);
      expect((await readFile(snapshotFile)).length).toBeGreaterThan(0);
      await rm(publicDir, { recursive: true });
    };
    const result = await runSiteBuild(options);
    expect(result.success).toBe(true);
    expect(
      new Uint8Array(await readFile(join(outputDir, "binary.dat"))),
    ).toEqual(bytes);
    expect(await readFile(join(outputDir, "index.html"), "utf8")).toContain(
      "<title>Home</title>",
    );
    assert.ok(snapshotFile);
    await assert.rejects(readFile(snapshotFile), { code: "ENOENT" });
    await mkdir(publicDir);
    await writeFile(join(publicDir, "binary.dat"), bytes);
    const skipped = await runSiteBuild(options);
    expect(skipped).toMatchObject({ success: true, skipped: true });
    expect(renders).toBe(1);
  });

  test("retains acknowledged publication through retirement failure without replay", async () => {
    await writeFile(join(publicDir, "binary.dat"), new Uint8Array([1, 2, 3]));
    retirementFailure = new Error("injected post-commit retirement failure");
    const result = await runSiteBuild(options);
    expect(result).toMatchObject({
      success: true,
      warnings: expect.arrayContaining([
        "Site output acknowledged but public asset retirement failed",
      ]),
    });
    assert.ok(snapshotFile);
    expect((await readFile(snapshotFile)).length).toBeGreaterThan(0);
    expect([...(await readFile(join(outputDir, "binary.dat")))]).toEqual([
      1, 2, 3,
    ]);
    retirementFailure = undefined;
    expect(await runSiteBuild(options)).toMatchObject({
      success: true,
      skipped: true,
    });
    expect(renders).toBe(1);
  });

  test("reports capture failure before rendering rather than classifying it as cancellation", async () => {
    await symlink(join(directory, "outside"), join(publicDir, "linked"));
    const result = await runSiteBuild(options);
    expect(result.success).toBe(false);
    expect(result.cancelled).not.toBe(true);
    expect(result.diagnostics).toEqual([
      expect.objectContaining({ code: "public-asset-snapshot-failed" }),
    ]);
    expect(renders).toBe(0);
  });
});
