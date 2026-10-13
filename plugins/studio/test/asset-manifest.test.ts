import { describe, expect, it } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  STUDIO_ENTRY_NAMING,
  studioAssetManifestSchema,
  studioStylesheetName,
} from "../src/ui-assets";

describe("Studio content-addressed assets", () => {
  it("changes the compiled entry URL when its content changes, not on identical builds", async () => {
    const directory = await mkdtemp(join(tmpdir(), "studio-entry-hash-"));
    try {
      const entry = join(directory, "entry.js");
      const compile = async (content: string): Promise<string> => {
        await Bun.write(entry, content);
        const result = await Bun.build({
          entrypoints: [entry],
          target: "browser",
          format: "esm",
          naming: { entry: STUDIO_ENTRY_NAMING },
        });
        expect(result.success).toBe(true);
        const output = result.outputs.find(
          (file) => file.kind === "entry-point",
        );
        if (!output) throw Error("Missing compiled entry");
        return output.path;
      };
      const initial = await compile('console.log("first")');
      expect(await compile('console.log("first")')).toBe(initial);
      expect(await compile('console.log("changed")')).not.toBe(initial);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
  it("changes the stylesheet URL only when its bytes change", () => {
    expect(studioStylesheetName("a{}")).toBe(studioStylesheetName("a{}"));
    expect(studioStylesheetName("a{}")).not.toBe(studioStylesheetName("b{}"));
  });

  it("publishes hashed entrypoints with matching immutable files", async () => {
    const manifest = studioAssetManifestSchema.parse(
      await Bun.file(
        new URL("../dist/ui/studio-asset-manifest.json", import.meta.url),
      ).json(),
    );
    const css = await Bun.file(
      new URL(`../dist/ui/${manifest.entrypoints.stylesheet}`, import.meta.url),
    ).text();
    expect(manifest.entrypoints.stylesheet).toBe(studioStylesheetName(css));
    expect(manifest.assets["app.js"]).toBeUndefined();
    expect(manifest.assets["app.css"]).toBeUndefined();
    for (const file of Object.values(manifest.assets)) {
      expect(
        await Bun.file(new URL(`../dist/ui/${file}`, import.meta.url)).exists(),
      ).toBe(true);
    }
  });

  it("rejects mutable aliases, traversal, and missing entrypoints", () => {
    const valid = {
      version: 2,
      entrypoints: {
        script: "studio-app-abc.js",
        stylesheet: "studio-app-def.css",
      },
      assets: {
        "studio-app-abc.js": "studio-app-abc.js",
        "studio-app-def.css": "studio-app-def.css",
      },
    };
    expect(studioAssetManifestSchema.safeParse(valid).success).toBe(true);
    for (const assets of [
      {},
      { ...valid.assets, "app.js": "studio-app-abc.js" },
      { ...valid.assets, "studio-app-abc.js": "../secret.js" },
      { ...valid.assets, "studio-app-abc.js": "studio-app-other.js" },
    ]) {
      expect(
        studioAssetManifestSchema.safeParse({ ...valid, assets }).success,
      ).toBe(false);
    }
  });
});
