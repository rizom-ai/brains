#!/usr/bin/env bun
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
