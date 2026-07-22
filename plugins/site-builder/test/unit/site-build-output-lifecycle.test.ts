import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import type { PreparedSiteBuild } from "@brains/site-engine";
import { createSilentLogger } from "@brains/test-utils";
import { promises as fs } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import {
  TransactionalSiteBuildOutput,
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
    expect(
      await fs.readFile(join(outputDir, ".site-build-manifest.json"), "utf8"),
    ).toContain('"buildId": "build-one"');
    expect(
      await fs.readFile(
        join(target.environmentDir, "legacy-build-one", "index.html"),
        "utf8",
      ),
    ).toBe("legacy output");
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
    const legacyDir = join(environmentDir, "legacy-old-build");
    const committedDir = join(environmentDir, "committed-build");
    await Promise.all(
      [staleDir, recentDir, legacyDir, committedDir].map((directory) =>
        fs.mkdir(directory, { recursive: true }),
      ),
    );
    await fs.writeFile(join(committedDir, ".site-build-manifest.json"), "{}");
    const oldDate = new Date(Date.now() - 10_000);
    await Promise.all([
      fs.utimes(staleDir, oldDate, oldDate),
      fs.utimes(legacyDir, oldDate, oldDate),
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
      expect.arrayContaining([
        "committed-build",
        "legacy-old-build",
        "new-build",
        "recent-build",
      ]),
    );
    expect(remaining).not.toContain("stale-build");
    await lifecycle.abort(target);
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
    fs.rename = mock(async (source, destination) => {
      if (!injected && String(source).includes(".site-preview.next-")) {
        injected = true;
        throw new Error("injected pointer switch failure");
      }
      return originalRename(source, destination);
    }) as typeof fs.rename;

    try {
      expect(
        lifecycle.commit({ target, preparedBuild, warnings: [] }),
      ).rejects.toThrow("injected pointer switch failure");
      expect((await fs.lstat(outputDir)).isDirectory()).toBe(true);
      expect(await fs.readFile(join(outputDir, "index.html"), "utf8")).toBe(
        "legacy output",
      );
    } finally {
      fs.rename = originalRename;
      await lifecycle.abort(target);
    }
  });
});
