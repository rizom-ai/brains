import { describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { publishManifestFor } from "@brains/build-tools";
import { z } from "@brains/utils/zod";
import { buildPublicUi } from "../scripts/build";
import * as publicEntry from "../src/index";
import * as internalEntry from "../src/internal";

const packageDir = join(import.meta.dir, "..");

const manifestSchema = z.looseObject({
  name: z.string(),
  private: z.boolean().optional(),
  license: z.string(),
  files: z.array(z.string()).optional(),
  scripts: z.record(z.string(), z.string()).optional(),
  publishConfig: z.looseObject({ access: z.string() }).optional(),
  repository: z.looseObject({ directory: z.string() }).optional(),
  exports: z.unknown(),
  dependencies: z.record(z.string(), z.string()).optional(),
  devDependencies: z.record(z.string(), z.string()).optional(),
  peerDependencies: z.record(z.string(), z.string()).optional(),
});

async function sourceManifest(): Promise<z.output<typeof manifestSchema>> {
  return manifestSchema.parse(
    JSON.parse(await readFile(join(packageDir, "package.json"), "utf8")),
  );
}

/** Every bare specifier a built file imports, excluding relative paths. */
function importedPackages(source: string): string[] {
  const specifiers = [
    ...source.matchAll(/\bfrom\s*["']([^"'./][^"']*)["']/g),
    ...source.matchAll(/\bimport\s*\(\s*["']([^"'./][^"']*)["']\s*\)/g),
    ...source.matchAll(/^\s*import\s+["']([^"'./][^"']*)["']/gm),
  ].map((match) => match[1] ?? "");
  return [...new Set(specifiers)].sort();
}

/** The package a specifier resolves through: `@scope/name` or `name`. */
function packageOf(specifier: string): string {
  const [first = "", second = ""] = specifier.split("/");
  return first.startsWith("@") ? `${first}/${second}` : first;
}

describe("@rizom/brain-ui package boundary", () => {
  test("publishes under its public name with no private runtime dependency", async () => {
    const manifest = await sourceManifest();

    expect(manifest.name).toBe("@rizom/brain-ui");
    expect(manifest.private).toBeUndefined();
    expect(manifest.publishConfig?.access).toBe("public");
    expect(manifest.repository?.directory).toBe("packages/ui");
    expect(manifest.scripts?.["prepack"]).toBe("publish-manifest prepare");

    const runtime = {
      ...manifest.dependencies,
      ...manifest.peerDependencies,
    };
    expect(
      Object.entries(runtime).filter(
        ([name, range]) =>
          name.startsWith("@brains/") || range.startsWith("workspace:"),
      ),
    ).toEqual([]);
  });

  test("is licensed Apache-2.0 like the site SDK it renders beside", async () => {
    const manifest = await sourceManifest();
    const siteSdk = join(packageDir, "../site");

    expect(manifest.license).toBe("Apache-2.0");
    expect(await readFile(join(packageDir, "LICENSE"), "utf8")).toBe(
      await readFile(join(siteSdk, "LICENSE"), "utf8"),
    );
  });

  test("ships the built public entry and nothing else", async () => {
    const published = await publishManifestFor(packageDir);

    expect(published["exports"]).toEqual({
      ".": { types: "./dist/index.d.ts", import: "./dist/index.js" },
    });
    expect(published["files"]).toEqual(["dist"]);
    expect(published).not.toHaveProperty("devDependencies");
    expect(published).not.toHaveProperty("publishExports");
  });

  test("keeps first-party names off the public entry", () => {
    const publicNames = Object.keys(publicEntry);
    const internalNames = Object.keys(internalEntry);

    expect(publicNames.length).toBeGreaterThan(0);
    expect(publicNames.filter((name) => internalNames.includes(name))).toEqual(
      [],
    );
  });

  test("builds JavaScript and declarations that import only its declared packages", async () => {
    const manifest = await sourceManifest();
    const declared = new Set([
      ...Object.keys(manifest.dependencies ?? {}),
      ...Object.keys(manifest.peerDependencies ?? {}),
    ]);
    const outputDirectory = await mkdtemp(join(tmpdir(), "brain-ui-build-"));
    try {
      await buildPublicUi(outputDirectory);
      const javascript = await readFile(
        join(outputDirectory, "index.js"),
        "utf8",
      );
      const declarations = await readFile(
        join(outputDirectory, "index.d.ts"),
        "utf8",
      );

      for (const built of [javascript, declarations]) {
        expect(
          importedPackages(built).filter(
            (specifier) => !declared.has(packageOf(specifier)),
          ),
        ).toEqual([]);
      }
      expect(javascript).not.toContain("react/jsx-dev-runtime");
      for (const name of Object.keys(publicEntry)) {
        expect(declarations).toContain(name);
      }
    } finally {
      await rm(outputDirectory, { recursive: true, force: true });
    }
  }, 60_000);
});
