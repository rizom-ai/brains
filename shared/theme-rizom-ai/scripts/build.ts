#!/usr/bin/env bun
/**
 * Build @rizom/theme-rizom-ai — inlines this package's theme.css (the bun
 * text import cannot ship) while composing the base at runtime through the
 * real @rizom/theme-default dependency, so base-theme fixes reach consumers
 * via npm resolution instead of being frozen at publish time.
 */
import { join } from "node:path";
import { buildThemePackage } from "@brains/build-tools";
import { FONT_IMPORT_RE } from "../src";
import themeCSSOnly from "../src/theme.css" with { type: "text" };

const { distDir, cssLength } = buildThemePackage({
  packageDir: join(import.meta.dir, ".."),
  themeCSSOnly,
  base: {
    packageName: "@rizom/theme-default",
    // The base's font imports are its own register — same strip as src/index.ts.
    stripPattern: FONT_IMPORT_RE,
  },
});

console.log(`Built ${distDir}/index.js (${cssLength} chars of CSS)`);
