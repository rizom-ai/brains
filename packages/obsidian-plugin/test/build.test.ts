import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildPlugin } from "../scripts/build";

/**
 * What Obsidian downloads and runs: `main.js`, built here as the release
 * builds it.
 */
describe("the built plugin", () => {
  const outdir = mkdtempSync(join(tmpdir(), "rizom-brain-build-"));
  let built = "";

  beforeAll(async () => {
    await buildPlugin(outdir);
    built = await Bun.file(join(outdir, "main.js")).text();
  });
  afterAll(() => rmSync(outdir, { recursive: true, force: true }));

  it("comes with its manifest and styles", async () => {
    expect(await Bun.file(join(outdir, "manifest.json")).exists()).toBe(true);
    expect(await Bun.file(join(outdir, "styles.css")).exists()).toBe(true);
  });

  it("leaves out the validation messages in languages it never shows", () => {
    expect(built).not.toContain("zod/v4/locales/lt.js");
    expect(built).not.toContain("zod/v4/locales/ja.js");
    // The English messages are the ones a refused value is reported in.
    expect(built).toContain("zod/v4/locales/en.js");
  });

  it("stays a small download", () => {
    expect(built.length).toBeLessThan(500 * 1024);
  });

  it("loads the way Obsidian loads it", () => {
    // Obsidian's own modules, as far as loading the file touches them: every
    // name is a class the plugin's classes can extend.
    const obsidian: unknown = new Proxy(
      {},
      { get: (): unknown => class ObsidianStandIn {} },
    );
    const loaded: { exports: Record<string, unknown> } = { exports: {} };
    const load = new Function("require", "module", "exports", built);

    load((): unknown => obsidian, loaded, loaded.exports);

    expect(typeof loaded.exports["default"]).toBe("function");
  });
});
