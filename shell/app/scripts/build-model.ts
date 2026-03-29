#!/usr/bin/env bun
/**
 * Build a generic brain model image bundle.
 *
 * Usage: bun shell/app/scripts/build-model.ts <brain-model>
 * Example: bun shell/app/scripts/build-model.ts rover
 *
 * Produces dist/ with a self-contained bundle that reads brain.yaml at runtime.
 * All workspace site packages are bundled so any instance can use any site.
 */
import { build } from "bun";
import {
  existsSync,
  writeFileSync,
  cpSync,
  mkdirSync,
  readdirSync,
  readFileSync,
} from "fs";
import { generateModelEntrypoint } from "../src/generate-entrypoint";
import { join, dirname } from "path";

// ─── Args ──────────────────────────────────────────────────────────────────

const modelName = process.argv[2];
if (!modelName) {
  console.error("Usage: bun build-model.ts <brain-model>");
  console.error("Example: bun build-model.ts rover");
  process.exit(1);
}

// ─── Find monorepo root ───────────────────────────────────────────────────

let monorepoRoot = process.cwd();
while (!existsSync(join(monorepoRoot, "bun.lock"))) {
  const parent = dirname(monorepoRoot);
  if (parent === monorepoRoot) {
    console.error("Could not find monorepo root");
    process.exit(1);
  }
  monorepoRoot = parent;
}

// ─── Validate brain model ─────────────────────────────────────────────────

const brainModelDir = join(monorepoRoot, "brains", modelName);
if (!existsSync(brainModelDir)) {
  console.error(`Brain model not found: brains/${modelName}/`);
  const available = readdirSync(join(monorepoRoot, "brains")).filter((d) =>
    existsSync(join(monorepoRoot, "brains", d, "package.json")),
  );
  console.error(`Available: ${available.join(", ")}`);
  process.exit(1);
}

const brainPkgJson = JSON.parse(
  readFileSync(join(brainModelDir, "package.json"), "utf-8"),
);
const brainPackage = brainPkgJson.name as string;

console.log(`Building model image: ${brainPackage} (${modelName})`);

// ─── Discover site packages ───────────────────────────────────────────────

const sitesDir = join(monorepoRoot, "sites");
const sitePackages: string[] = [];

if (existsSync(sitesDir)) {
  for (const dir of readdirSync(sitesDir)) {
    const pkgPath = join(sitesDir, dir, "package.json");
    if (existsSync(pkgPath)) {
      const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
      if (typeof pkg.name === "string") {
        sitePackages.push(pkg.name);
      }
    }
  }
}

if (sitePackages.length > 0) {
  console.log(`Bundling site packages: ${sitePackages.join(", ")}`);
}

// ─── Generate entrypoint ──────────────────────────────────────────────────

const entrypointCode = generateModelEntrypoint(brainPackage, sitePackages);
const entrypointPath = join(brainModelDir, ".model-entrypoint.ts");
writeFileSync(entrypointPath, entrypointCode);

// ─── Bundle ───────────────────────────────────────────────────────────────

const outdir = join(brainModelDir, "dist");

try {
  const result = await build({
    entrypoints: [entrypointPath],
    outdir,
    target: "bun",
    format: "esm",
    minify: true,
    sourcemap: "external",
    external: [
      // Native modules that cannot be bundled
      "@libsql/client",
      "libsql",
      "lightningcss",
      "onnxruntime-node",
      "fastembed",
      "@tailwindcss/oxide",
      // Dev-only dependencies not needed at runtime
      "react-devtools-core",
    ],
  });

  if (!result.success) {
    console.error("Build failed:", result.logs);
    process.exit(1);
  }
} finally {
  // Clean up generated entrypoint
  if (existsSync(entrypointPath)) {
    const { unlinkSync } = await import("fs");
    unlinkSync(entrypointPath);
  }
}

// ─── Copy migrations ──────────────────────────────────────────────────────

const migrationsDir = join(outdir, "migrations");
mkdirSync(migrationsDir, { recursive: true });

const migrationSources = [
  {
    name: "entity-service",
    path: join(monorepoRoot, "shell/entity-service/drizzle"),
  },
  {
    name: "conversation-service",
    path: join(monorepoRoot, "shell/conversation-service/drizzle"),
  },
  { name: "job-queue", path: join(monorepoRoot, "shell/job-queue/drizzle") },
];

for (const { name, path } of migrationSources) {
  if (existsSync(path)) {
    cpSync(path, join(migrationsDir, name), { recursive: true });
    console.log(`Copied migrations: ${name}`);
  }
}

// ─── Copy seed content from brain model ───────────────────────────────────

const seedContentPath = join(brainModelDir, "seed-content");
if (existsSync(seedContentPath)) {
  cpSync(seedContentPath, join(outdir, "seed-content"), { recursive: true });
  console.log("Copied seed-content");
}

console.log(`Build complete: ${outdir}/.model-entrypoint.js`);
