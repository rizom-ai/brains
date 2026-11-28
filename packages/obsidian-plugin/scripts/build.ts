/**
 * Builds the plugin as Obsidian loads it: `main.js` (CommonJS, with
 * Obsidian's own modules left to Obsidian), next to `manifest.json` and
 * `styles.css`.
 */
import { copyFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import type { BunPlugin } from "bun";

const root = join(import.meta.dir, "..");

/**
 * Zod carries its messages in some forty languages and exports them all as
 * one object, which no bundler can drop. The plugin reports a refused value
 * in English only, so that object is built empty; the English messages are
 * imported on their own and stay.
 */
const withoutUnusedLocales: BunPlugin = {
  name: "without-unused-zod-locales",
  setup(build) {
    build.onLoad({ filter: /zod[\\/]v4[\\/]locales[\\/]index\.js$/ }, () => ({
      contents: "export {};",
      loader: "js",
    }));
  },
};

export async function buildPlugin(outdir: string): Promise<void> {
  mkdirSync(outdir, { recursive: true });
  const result = await Bun.build({
    entrypoints: [join(root, "src/obsidian/main.ts")],
    outdir,
    naming: "main.js",
    format: "cjs",
    target: "browser",
    // Left readable: Obsidian's reviewers and anyone curious read this file.
    minify: false,
    external: ["obsidian", "electron", "@codemirror/*", "@lezer/*"],
    plugins: [withoutUnusedLocales],
  });
  if (!result.success) {
    throw new AggregateError(result.logs, "The plugin did not build");
  }
  for (const file of ["manifest.json", "styles.css"]) {
    copyFileSync(join(root, file), join(outdir, file));
  }
}

if (import.meta.main) {
  const outdir = join(root, "dist");
  await buildPlugin(outdir);
  console.log(`Built ${outdir}`);
}
