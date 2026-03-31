#!/usr/bin/env bun
/**
 * Build the brain CLI for npm publish.
 *
 * Bundles all source into a single dist/brain.js file.
 * MCP SDK is external (runtime dependency).
 */
import { writeFileSync, mkdirSync } from "fs";
import { join } from "path";

const outdir = join(import.meta.dir, "..", "dist");
mkdirSync(outdir, { recursive: true });

const result = await Bun.build({
  entrypoints: [join(import.meta.dir, "..", "src", "index.ts")],
  outdir,
  target: "node",
  format: "esm",
  external: ["@modelcontextprotocol/sdk"],
  minify: false,
  sourcemap: "none",
  naming: "brain.js",
});

if (!result.success) {
  console.error("Build failed:");
  for (const log of result.logs) {
    console.error(log);
  }
  process.exit(1);
}

// Replace shebang with Node (Bun.build preserves the bun shebang)
const outFile = join(outdir, "brain.js");
const content = Bun.file(outFile);
const text = await content.text();
const stripped = text.replace(/^#!.*\n/gm, "");
writeFileSync(outFile, `#!/usr/bin/env node\n${stripped}`);

console.log(`Built dist/brain.js (${Math.round(text.length / 1024)}KB)`);
