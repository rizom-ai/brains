#!/usr/bin/env bun
// Compile all hydration.tsx files to hydration.compiled.js
// Run via: bun scripts/compile-hydration.ts
import { build, Glob } from "bun";
import { writeFileSync } from "fs";
import { join, dirname } from "path";

const monorepoRoot = dirname(import.meta.dir);

const BANNER = `\
var { h, hydrate, useState, useMemo, useEffect, useCallback, useRef, useContext, createContext, jsx, jsxs } = window.preact;
var __require = function(mod) {
  if (mod === "crypto") return { randomUUID: () => window.crypto.randomUUID() };
  throw new Error("Cannot require " + mod + " in browser");
};
`;

let count = 0;
const glob = new Glob("**/templates/*/hydration.tsx");

for await (const path of glob.scan({ cwd: monorepoRoot, absolute: false })) {
  // Skip node_modules
  if (path.includes("node_modules")) continue;

  const sourceFile = join(monorepoRoot, path);
  const outputFile = sourceFile.replace(/\.tsx$/, ".compiled.js");

  const result = await build({
    entrypoints: [sourceFile],
    target: "browser",
    format: "iife",
    minify: false,
    sourcemap: "none",
    external: ["preact", "preact/hooks", "preact/jsx-runtime", "crypto"],
    define: {
      "import.meta.env.SSR": "false",
    },
  });

  if (!result.success) {
    console.error(`Failed to compile: ${path}`);
    for (const log of result.logs) {
      console.error(log);
    }
    process.exit(1);
  }

  let code = await result.outputs[0]!.text();

  // Replace bundler's preact references with window.preact globals
  code = code
    .replace(/import\s*{[^}]+}\s*from\s*["']preact["'];?/g, "")
    .replace(/import\s*{[^}]+}\s*from\s*["']preact\/hooks["'];?/g, "")
    .replace(/var import_hooks\d* = __require\("preact\/hooks"\);/g, "")
    .replace(/var import_preact\d* = __require\("preact"\);/g, "")
    .replace(/var import_preact\d* = require\("preact"\);/g, "")
    .replace(/(?:\(0, )?import_preact\d*\.(\w+)\)?/g, "window.preact.$1")
    .replace(/(?:\(0, )?import_hooks\d*\.(\w+)\)?/g, "window.preact.$1")
    .replace(/__require\("preact[^"]*"\)/g, "window.preact");

  writeFileSync(outputFile, BANNER + code, "utf8");
  count++;
  console.log(`Compiled: ${path} → ${path.replace(/\.tsx$/, ".compiled.js")}`);
}

if (count === 0) {
  console.log("No hydration scripts found");
} else {
  console.log(`Compiled ${count} hydration script(s)`);
}
