#!/usr/bin/env bun
/**
 * Build @rizom/theme-rizom-ai — inlines this package's theme.css (the bun
 * text import cannot ship) while composing the base at runtime through the
 * real @rizom/theme-default dependency, so base-theme fixes reach consumers
 * via npm resolution instead of being frozen at publish time.
 */
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { FONT_IMPORT_RE } from "../src";
import themeCSSOnly from "../src/theme.css" with { type: "text" };

const packageDir = join(import.meta.dir, "..");
const distDir = join(packageDir, "dist");

rmSync(distDir, { recursive: true, force: true });
mkdirSync(distDir, { recursive: true });

writeFileSync(
  join(distDir, "index.js"),
  [
    `import defaultThemeCSS from "@rizom/theme-default";`,
    `const themeCSSOnly = ${JSON.stringify(themeCSSOnly)};`,
    // The base's font imports are its own register — same strip as src/index.ts.
    `const FONT_IMPORT_RE = ${FONT_IMPORT_RE.toString()};`,
    'const themeCSS = `${defaultThemeCSS.replace(FONT_IMPORT_RE, "")}\\n\\n${themeCSSOnly}`;',
    `export default themeCSS;`,
    `export { themeCSS, themeCSSOnly };`,
    "",
  ].join("\n"),
);

writeFileSync(
  join(distDir, "index.d.ts"),
  [
    `declare const themeCSS: string;`,
    `declare const themeCSSOnly: string;`,
    `export default themeCSS;`,
    `export { themeCSS, themeCSSOnly };`,
    "",
  ].join("\n"),
);

console.log(`Built ${distDir}/index.js (${themeCSSOnly.length} chars of CSS)`);
