/**
 * Builds the plugin as Obsidian loads it: `dist/main.js` (CommonJS, with
 * Obsidian's own modules left to Obsidian), next to `manifest.json` and
 * `styles.css`.
 */
import { copyFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dir, "..");
const outdir = join(root, "dist");
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
});
if (!result.success) {
  for (const log of result.logs) console.error(log);
  process.exit(1);
}
for (const file of ["manifest.json", "styles.css"]) {
  copyFileSync(join(root, file), join(outdir, file));
}
console.log(`Built ${outdir}`);
