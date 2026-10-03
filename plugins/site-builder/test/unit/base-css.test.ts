import { describe, expect, it } from "bun:test";
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { TailwindCSSProcessor } from "@brains/site-engine";
import { createSilentLogger } from "@brains/test-utils";
import baseCSS from "../../src/styles/base.css" with { type: "text" };

describe("site base stylesheet", () => {
  it("paints the page colour on the document canvas, so overscroll past the footer is never white", () => {
    expect(baseCSS).toMatch(
      /html \{\s*background-color: var\(--color-bg\);\s*\}/,
    );
  });

  it("generates utilities from the built pages and scripts, never from the working directory", async () => {
    // Outside the repository, linked to its packages so the stylesheet
    // resolves its Tailwind imports.
    const buildRoot = await mkdtemp(join(tmpdir(), "site-css-build-"));
    await symlink(
      join(import.meta.dir, "..", "..", "..", "..", "node_modules"),
      join(buildRoot, "node_modules"),
    );
    const outputDir = join(buildRoot, "output");
    await mkdir(outputDir);
    const workingDir = await mkdtemp(join(tmpdir(), "site-css-cwd-"));
    const previous = process.cwd();
    try {
      await writeFile(
        join(outputDir, "index.html"),
        '<div class="flex"></div>',
      );
      await mkdir(join(outputDir, "scripts"));
      await writeFile(
        join(outputDir, "scripts", "toggle.js"),
        'el.classList.add("underline");',
      );
      // Anything else in the instance directory, such as content or stores.
      await writeFile(join(workingDir, "notes.md"), "skew-x-12");
      process.chdir(workingDir);

      await new TailwindCSSProcessor().process(
        baseCSS,
        "",
        workingDir,
        outputDir,
        createSilentLogger(),
        new AbortController().signal,
      );

      const css = await readFile(join(outputDir, "styles", "main.css"), "utf8");
      expect(css).toContain(".flex");
      expect(css).toContain(".underline");
      expect(css).not.toContain(".skew-x-12");
    } finally {
      process.chdir(previous);
      await rm(buildRoot, { recursive: true, force: true });
      await rm(workingDir, { recursive: true, force: true });
    }
  }, 60_000);
});
