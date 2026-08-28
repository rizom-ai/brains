import { describe, expect, it } from "bun:test";
import { readPackageManifestFromTarball } from "./package-tarball";

async function createTarball(files: Record<string, string>): Promise<Blob> {
  return new Bun.Archive(files, { compress: "gzip" }).blob();
}

describe("readPackageManifestFromTarball", () => {
  it("reads the manifest from an npm-shaped tarball", async () => {
    const manifest = {
      name: "@rizom/site-example",
      version: "1.2.3",
      peerDependencies: { "@rizom/brain": "^0.2.0" },
    };
    const tarball = await createTarball({
      "package/package.json": JSON.stringify(manifest),
    });

    expect(
      await readPackageManifestFromTarball(
        tarball,
        "@rizom/site-example@1.2.3",
      ),
    ).toEqual(manifest);
  });

  it("ignores unrelated archive entries", async () => {
    const manifest = { name: "@rizom/theme-example", version: "1.0.0" };
    const tarball = await createTarball({
      "package/README.md": "# Example",
      "package/dist/index.js": "export {};",
      "package/package.json": JSON.stringify(manifest),
    });

    expect(
      await readPackageManifestFromTarball(
        tarball,
        "@rizom/theme-example@1.0.0",
      ),
    ).toEqual(manifest);
  });

  it("reports a missing package manifest", async () => {
    const tarball = await createTarball({
      "package/README.md": "# Missing manifest",
    });

    expect(
      readPackageManifestFromTarball(tarball, "@rizom/site-missing@1.0.0"),
    ).rejects.toThrow(
      "@rizom/site-missing@1.0.0 tarball does not contain package/package.json",
    );
  });

  it("reports malformed manifest JSON", async () => {
    const tarball = await createTarball({
      "package/package.json": '{"name":',
    });

    expect(
      readPackageManifestFromTarball(tarball, "@rizom/site-invalid@1.0.0"),
    ).rejects.toThrow(
      "Could not parse package/package.json from @rizom/site-invalid@1.0.0 tarball",
    );
  });

  it("rejects a non-object package manifest", async () => {
    const tarball = await createTarball({
      "package/package.json": JSON.stringify(["not", "an", "object"]),
    });

    expect(
      readPackageManifestFromTarball(tarball, "@rizom/site-array@1.0.0"),
    ).rejects.toThrow(
      "package/package.json from @rizom/site-array@1.0.0 tarball is not an object",
    );
  });

  it("reports a corrupt archive", () => {
    expect(
      readPackageManifestFromTarball(
        new Blob(["not a tar archive"]),
        "@rizom/site-corrupt@1.0.0",
      ),
    ).rejects.toThrow(
      "Could not read @rizom/site-corrupt@1.0.0 tarball archive",
    );
  });
});
