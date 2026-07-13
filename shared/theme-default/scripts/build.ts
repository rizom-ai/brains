#!/usr/bin/env bun
/**
 * Build @rizom/theme-default — a theme is one CSS string, so the "build"
 * inlines theme.css into a dependency-free ESM module + declaration. The
 * published artifact is dist-only per the repo's publish convention (the
 * bun text import cannot ship).
 */
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import themeCSSOnly from "../src/theme.css" with { type: "text" };

const packageDir = join(import.meta.dir, "..");
const distDir = join(packageDir, "dist");

rmSync(distDir, { recursive: true, force: true });
mkdirSync(distDir, { recursive: true });

writeFileSync(
  join(distDir, "index.js"),
  [
    `const themeCSSOnly = ${JSON.stringify(themeCSSOnly)};`,
    `export default themeCSSOnly;`,
    `export { themeCSSOnly };`,
    "",
  ].join("\n"),
);

writeFileSync(
  join(distDir, "index.d.ts"),
  [
    `declare const themeCSSOnly: string;`,
    `export default themeCSSOnly;`,
    `export { themeCSSOnly };`,
    "",
  ].join("\n"),
);

console.log(`Built ${distDir}/index.js (${themeCSSOnly.length} chars of CSS)`);
