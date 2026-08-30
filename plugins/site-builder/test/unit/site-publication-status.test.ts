import { afterEach, describe, expect, it } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { SITE_BUILD_MANIFEST_FILE } from "../../src/lib/site-build-artifact-manifest";
import { readSitePublicationStatus } from "../../src/lib/site-publication-status";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((path) => rm(path, { recursive: true, force: true })),
  );
});

async function outputDirectory(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "site-publication-status-"));
  temporaryDirectories.push(root);
  const output = join(root, "site-production");
  await mkdir(output, { recursive: true });
  return output;
}

function manifest(
  environment: "preview" | "production",
): Record<string, unknown> {
  return {
    version: 1,
    buildId: "generation-837",
    environment,
    routes: [
      { routeId: "home", urlPath: "/", outputFile: "index.html" },
      { routeId: "docs", urlPath: "/docs", outputFile: "docs/index.html" },
    ],
    files: [],
    images: {},
    staticAssets: [],
    publicAssets: [],
    scripts: { global: [], byRoute: {} },
    warnings: ["One retained warning"],
  };
}

describe("readSitePublicationStatus", () => {
  it("reports the generation actually selected by the active output", async () => {
    const output = await outputDirectory();
    await writeFile(
      join(output, SITE_BUILD_MANIFEST_FILE),
      JSON.stringify(manifest("production")),
    );

    const status = await readSitePublicationStatus(output, "production");

    expect(status).toMatchObject({
      state: "published",
      buildId: "generation-837",
      routesBuilt: 2,
      warnings: ["One retained warning"],
    });
    expect(status.state === "published" && status.publishedAt).toMatch(
      /^\d{4}-\d{2}-\d{2}T/,
    );
  });

  it("fails visibly when the active output manifest is unreadable", async () => {
    const output = await outputDirectory();
    await writeFile(join(output, SITE_BUILD_MANIFEST_FILE), "not json");

    expect(await readSitePublicationStatus(output, "production")).toMatchObject(
      {
        state: "unreadable",
        message: expect.stringContaining("published production generation"),
      },
    );
  });

  it("rejects a manifest for the wrong environment", async () => {
    const output = await outputDirectory();
    await writeFile(
      join(output, SITE_BUILD_MANIFEST_FILE),
      JSON.stringify(manifest("preview")),
    );

    expect(await readSitePublicationStatus(output, "production")).toMatchObject(
      {
        state: "unreadable",
        message: expect.stringContaining("expected production, found preview"),
      },
    );
  });
});
