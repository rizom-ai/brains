#!/usr/bin/env bun
/**
 * Build @rizom/theme-default — the base theme stands alone, so the emitted
 * module is dependency-free.
 */
import { join } from "node:path";
import { buildThemePackage } from "@brains/build-tools";
import themeCSSOnly from "../src/theme.css" with { type: "text" };

const { distDir, cssLength } = buildThemePackage({
  packageDir: join(import.meta.dir, ".."),
  themeCSSOnly,
});

console.log(`Built ${distDir}/index.js (${cssLength} chars of CSS)`);
