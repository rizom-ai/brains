import { afterEach, beforeEach, describe, expect, it, spyOn } from "bun:test";
import {
  siteBuildArtifactManifestSchema,
  type PreparedSiteBuild,
} from "@brains/site-engine";
import { createSilentLogger } from "@brains/test-utils";
import { promises as fs } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import {
  nodeSiteBuildOutputFs,
  TransactionalSiteBuildOutput,
  type SiteBuildOutputFs,
  type SiteBuildOutputTarget,
} from "../../src/lib/site-build-output-lifecycle";

function createPreparedBuild(buildId: string): PreparedSiteBuild {
  return {
    buildId,
    preparedAt: "2026-07-22T00:00:00.000Z",
    environment: "preview",
    site: {
      title: "Transactional Site",
      description: "Transactional fixture",
      copyright: "Fixture copyright",
      navigation: { primary: [], secondary: [] },
    },
    routes: [
      {
        id: "home",
        path: "/",
        title: "Home",
        description: "Home route",
        layout: "default",
        fullscreen: false,
        sections: [],
        headScripts: [],
      },
    ],
    images: {},
    staticAssets: { "/assets/site.txt": "site asset" },
    publicAssets: { "public-logo.bin": "AAECAw==" },
    globalHeadScripts: [],
  };
}

async function writeCompleteGeneration(
  target: SiteBuildOutputTarget,
  marker: string,
): Promise<void> {
  await fs.mkdir(join(target.generationDir, "styles"), { recursive: true });
  await fs.mkdir(join(target.generationDir, "assets"), { recursive: true });
  await fs.writeFile(join(target.generationDir, "index.html"), marker);
  await fs.writeFile(join(target.generationDir, "styles/main.css"), "body{}");
  await fs.writeFile(
    join(target.generationDir, "assets/site.txt"),
    "site asset",
  );
  await fs.writeFile(
    join(target.generationDir, "public-logo.bin"),
    Buffer.from([0, 1, 2, 3]),
  );
  await fs.writeFile(join(target.generationDir, "robots.txt"), "robots");
  await fs.writeFile(join(target.generationDir, "sitemap.xml"), "sitemap");
}

describe("TransactionalSiteBuildOutput", () => {
  let testDir: string;
  let outputDir: string;
  let lifecycle: TransactionalSiteBuildOutput;

  beforeEach(async () => {
    testDir = await fs.mkdtemp(join(tmpdir(), "site-output-lifecycle-"));
    outputDir = join(testDir, "site-preview");
    lifecycle = new TransactionalSiteBuildOutput(createSilentLogger());
  });

  afterEach(async () => {
    await fs.rm(testDir, { recursive: true, force: true });
  });

  it("validates a generation, writes its manifest, and migrates a legacy directory", async () => {
    await fs.mkdir(outputDir, { recursive: true });
    await fs.writeFile(join(outputDir, "index.html"), "legacy output");
    const preparedBuild = createPreparedBuild("build-one");
    const target = await lifecycle.begin({
      outputDir,
      environment: "preview",
      buildId: preparedBuild.buildId,
    });
    await writeCompleteGeneration(target, "new output");

    const result = await lifecycle.commit({
      target,
      preparedBuild,
      warnings: ["fixture warning"],
    });

    expect((await fs.lstat(outputDir)).isSymbolicLink()).toBe(true);
    expect(await fs.readFile(join(outputDir, "index.html"), "utf8")).toBe(
      "new output",
    );
    expect(result.filesGenerated).toBe(7);
    expect(result.manifest).toMatchObject({
      buildId: "build-one",
      warnings: ["fixture warning"],
      routes: [{ routeId: "home", urlPath: "/", outputFile: "index.html" }],
      publicAssets: ["public-logo.bin"],
      files: expect.arrayContaining([
        expect.objectContaining({
          path: "public-logo.bin",
          kind: "public",
          size: 4,
          sha256: expect.stringMatching(/^[a-f0-9]{64}$/),
        }),
        expect.objectContaining({ path: "robots.txt", kind: "seo", size: 6 }),
        expect.objectContaining({
          path: "sitemap.xml",
          kind: "seo",
          size: 7,
        }),
      ]),
    });
    const persisted = await fs.readFile(
      join(outputDir, ".site-build-manifest.json"),
      "utf8",
    );
    const persistedManifest = siteBuildArtifactManifestSchema.parse(
      JSON.parse(persisted),
    );
    expect(persistedManifest).toEqual(result.manifest);
    expect(persistedManifest.warnings).toEqual(["fixture warning"]);
    // The pre-upgrade directory is moved aside only for the duration of the
    // swap. Once the new generation is verified it is gone, so nothing about
    // migration outlives the build that performed it.
    expect(await fs.readdir(target.environmentDir)).toEqual(["build-one"]);
  });

  it("preserves a pre-upgrade image cache while migrating", async () => {
    // `sharedImagesDir` defaults outside the site directory, but older layouts
    // kept the sharp cache at `<output>/images` — main's clean() skips exactly
    // that path. It is the only content here that a rebuild cannot cheaply
    // reproduce, so it moves to the shared cache instead of being discarded.
    await fs.mkdir(join(outputDir, "images"), { recursive: true });
    await fs.writeFile(join(outputDir, "index.html"), "legacy output");
    await fs.writeFile(join(outputDir, "images", "hero.webp"), "derivative");

    const preparedBuild = createPreparedBuild("build-images");
    const target = await lifecycle.begin({
      outputDir,
      environment: "preview",
      buildId: preparedBuild.buildId,
    });
    await writeCompleteGeneration(target, "new output");
    await lifecycle.commit({
      target,
      preparedBuild,
      inputFingerprint: "a".repeat(64),
      warnings: [],
    });

    expect((await fs.lstat(outputDir)).isSymbolicLink()).toBe(true);
    expect(
      await fs.readFile(join(testDir, "images", "hero.webp"), "utf8"),
    ).toBe("derivative");
    expect(await fs.readdir(target.environmentDir)).toEqual(["build-images"]);
  });

  it("atomically replaces an existing active symlink and retains the previous generation", async () => {
    const firstBuild = createPreparedBuild("build-one");
    const firstTarget = await lifecycle.begin({
      outputDir,
      environment: "preview",
      buildId: firstBuild.buildId,
    });
    await writeCompleteGeneration(firstTarget, "first output");
    await lifecycle.commit({
      target: firstTarget,
      preparedBuild: firstBuild,
      warnings: [],
    });

    const secondBuild = createPreparedBuild("build-two");
    const secondTarget = await lifecycle.begin({
      outputDir,
      environment: "preview",
      buildId: secondBuild.buildId,
    });
    await writeCompleteGeneration(secondTarget, "second output");
    await lifecycle.commit({
      target: secondTarget,
      preparedBuild: secondBuild,
      warnings: [],
    });

    expect(await fs.readFile(join(outputDir, "index.html"), "utf8")).toBe(
      "second output",
    );
    expect(
      await fs.readFile(join(firstTarget.generationDir, "index.html"), "utf8"),
    ).toBe("first output");
  });

  it("leaves the active output untouched when manifest validation fails", async () => {
    const firstBuild = createPreparedBuild("build-one");
    const firstTarget = await lifecycle.begin({
      outputDir,
      environment: "preview",
      buildId: firstBuild.buildId,
    });
    await writeCompleteGeneration(firstTarget, "stable output");
    await lifecycle.commit({
      target: firstTarget,
      preparedBuild: firstBuild,
      warnings: [],
    });

    const invalidBuild = createPreparedBuild("build-invalid");
    const invalidTarget = await lifecycle.begin({
      outputDir,
      environment: "preview",
      buildId: invalidBuild.buildId,
    });
    await fs.writeFile(
      join(invalidTarget.generationDir, "index.html"),
      "partial output",
    );

    expect(
      lifecycle.commit({
        target: invalidTarget,
        preparedBuild: invalidBuild,
        warnings: [],
      }),
    ).rejects.toThrow("Expected CSS artifact is missing");
    expect(await fs.readFile(join(outputDir, "index.html"), "utf8")).toBe(
      "stable output",
    );

    await lifecycle.abort(invalidTarget);
    expect(
      await fs
        .access(invalidTarget.generationDir)
        .then(() => true)
        .catch(() => false),
    ).toBe(false);
  });

  it("removes only stale uncommitted generations before staging", async () => {
    const environmentDir = join(testDir, ".site-builds", "preview");
    const staleDir = join(environmentDir, "stale-build");
    const recentDir = join(environmentDir, "recent-build");
    const committedDir = join(environmentDir, "committed-build");
    await Promise.all(
      [staleDir, recentDir, committedDir].map((directory) =>
        fs.mkdir(directory, { recursive: true }),
      ),
    );
    await fs.writeFile(join(committedDir, ".site-build-manifest.json"), "{}");
    const oldDate = new Date(Date.now() - 10_000);
    await Promise.all([
      fs.utimes(staleDir, oldDate, oldDate),
      fs.utimes(committedDir, oldDate, oldDate),
    ]);
    lifecycle = new TransactionalSiteBuildOutput(
      createSilentLogger(),
      3,
      1_000,
    );

    const target = await lifecycle.begin({
      outputDir,
      environment: "preview",
      buildId: "new-build",
    });

    const remaining = await fs.readdir(environmentDir);
    expect(remaining).toEqual(
      expect.arrayContaining(["committed-build", "new-build", "recent-build"]),
    );
    expect(remaining).not.toContain("stale-build");
    await lifecycle.abort(target);
  });

  it("keeps pruning old generations when one vanishes mid-scan", async () => {
    // A committed generation whose directory disappears after its manifest is
    // observed but before it can be stat'd during pruning. The injected fs
    // fails stat for that one path and delegates everything else to disk.
    let phantomDir = "";
    const failingStatFs: SiteBuildOutputFs = {
      ...nodeSiteBuildOutputFs,
      stat: (path) =>
        path === phantomDir
          ? Promise.reject(
              Object.assign(new Error("ENOENT"), { code: "ENOENT" }),
            )
          : nodeSiteBuildOutputFs.stat(path),
    };
    const retainingLifecycle = new TransactionalSiteBuildOutput(
      createSilentLogger(),
      1,
      1_000,
      failingStatFs,
    );

    const firstBuild = createPreparedBuild("build-one");
    const firstTarget = await retainingLifecycle.begin({
      outputDir,
      environment: "preview",
      buildId: firstBuild.buildId,
    });
    await writeCompleteGeneration(firstTarget, "first output");
    await retainingLifecycle.commit({
      target: firstTarget,
      preparedBuild: firstBuild,
      warnings: [],
    });

    phantomDir = join(firstTarget.environmentDir, "phantom-build");
    await fs.mkdir(phantomDir, { recursive: true });
    await fs.writeFile(join(phantomDir, ".site-build-manifest.json"), "{}");

    const secondBuild = createPreparedBuild("build-two");
    const secondTarget = await retainingLifecycle.begin({
      outputDir,
      environment: "preview",
      buildId: secondBuild.buildId,
    });
    await writeCompleteGeneration(secondTarget, "second output");
    await retainingLifecycle.commit({
      target: secondTarget,
      preparedBuild: secondBuild,
      warnings: [],
    });

    // The vanished generation must not abort the whole prune: the oldest
    // committed generation is still removed, the newest stays active, and the
    // phantom directory is left untouched.
    expect(
      await fs
        .access(firstTarget.generationDir)
        .then(() => true)
        .catch(() => false),
    ).toBe(false);
    expect(await fs.readFile(join(outputDir, "index.html"), "utf8")).toBe(
      "second output",
    );
    expect(
      await fs
        .access(phantomDir)
        .then(() => true)
        .catch(() => false),
    ).toBe(true);
  });

  it("rolls a legacy directory back when its first pointer switch fails", async () => {
    await fs.mkdir(outputDir, { recursive: true });
    await fs.writeFile(join(outputDir, "index.html"), "legacy output");
    const preparedBuild = createPreparedBuild("build-rollback");
    const target = await lifecycle.begin({
      outputDir,
      environment: "preview",
      buildId: preparedBuild.buildId,
    });
    await writeCompleteGeneration(target, "new output");

    const originalRename = fs.rename;
    let injected = false;
    // spyOn types the stub by the member it replaces, so the injected failure
    // cannot drift from the real rename signature.
    const rename = spyOn(fs, "rename").mockImplementation(
      async (source, destination) => {
        if (!injected && String(source).includes(".site-preview.next-")) {
          injected = true;
          throw new Error("injected pointer switch failure");
        }
        return originalRename(source, destination);
      },
    );

    try {
      expect(
        lifecycle.commit({
          target,
          preparedBuild,
          inputFingerprint: "a".repeat(64),
          warnings: [],
        }),
      ).rejects.toThrow("injected pointer switch failure");
      expect((await fs.lstat(outputDir)).isDirectory()).toBe(true);
      expect(await fs.readFile(join(outputDir, "index.html"), "utf8")).toBe(
        "legacy output",
      );
    } finally {
      rename.mockRestore();
      await lifecycle.abort(target);
    }
  });

  // Rollback for the steady-state path. The legacy-directory rollback above
  // runs at most once per environment; this symlink replacement is what every
  // build from the second onward actually depends on.
  async function commitFirstGeneration(): Promise<void> {
    const firstBuild = createPreparedBuild("build-one");
    const firstTarget = await lifecycle.begin({
      outputDir,
      environment: "preview",
      buildId: firstBuild.buildId,
    });
    await writeCompleteGeneration(firstTarget, "first output");
    await lifecycle.commit({
      target: firstTarget,
      preparedBuild: firstBuild,
      warnings: [],
    });
  }

  it("leaves the previous generation active when the pointer switch fails", async () => {
    await commitFirstGeneration();

    const failingRenameFs: SiteBuildOutputFs = {
      ...nodeSiteBuildOutputFs,
      rename: (oldPath, newPath) =>
        oldPath.includes(".site-preview.next-")
          ? Promise.reject(new Error("injected pointer switch failure"))
          : nodeSiteBuildOutputFs.rename(oldPath, newPath),
    };
    const failingLifecycle = new TransactionalSiteBuildOutput(
      createSilentLogger(),
      3,
      60 * 60 * 1_000,
      failingRenameFs,
    );

    const secondBuild = createPreparedBuild("build-two");
    const secondTarget = await failingLifecycle.begin({
      outputDir,
      environment: "preview",
      buildId: secondBuild.buildId,
    });
    await writeCompleteGeneration(secondTarget, "second output");

    expect(
      failingLifecycle.commit({
        target: secondTarget,
        preparedBuild: secondBuild,
        warnings: [],
      }),
    ).rejects.toThrow("injected pointer switch failure");

    expect((await fs.lstat(outputDir)).isSymbolicLink()).toBe(true);
    expect(await fs.readFile(join(outputDir, "index.html"), "utf8")).toBe(
      "first output",
    );
    await failingLifecycle.abort(secondTarget);
  });

  it("restores the previous generation pointer when the published generation fails verification", async () => {
    await commitFirstGeneration();

    let readlinkCalls = 0;
    const misreportingFs: SiteBuildOutputFs = {
      ...nodeSiteBuildOutputFs,
      readlink: (path) => {
        readlinkCalls += 1;
        // Call one captures the pointer to roll back to; call two is the
        // post-switch verification, which must disagree to force a rollback.
        return readlinkCalls === 1
          ? nodeSiteBuildOutputFs.readlink(path)
          : Promise.resolve(".site-builds/preview/unexpected-generation");
      },
    };
    const misreportingLifecycle = new TransactionalSiteBuildOutput(
      createSilentLogger(),
      3,
      60 * 60 * 1_000,
      misreportingFs,
    );

    const secondBuild = createPreparedBuild("build-two");
    const secondTarget = await misreportingLifecycle.begin({
      outputDir,
      environment: "preview",
      buildId: secondBuild.buildId,
    });
    await writeCompleteGeneration(secondTarget, "second output");

    expect(
      misreportingLifecycle.commit({
        target: secondTarget,
        preparedBuild: secondBuild,
        warnings: [],
      }),
    ).rejects.toThrow("Active site output points to unexpected generation");

    expect((await fs.lstat(outputDir)).isSymbolicLink()).toBe(true);
    expect(await fs.readFile(join(outputDir, "index.html"), "utf8")).toBe(
      "first output",
    );
    await misreportingLifecycle.abort(secondTarget);
  });
});
