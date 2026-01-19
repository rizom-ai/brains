#!/usr/bin/env bun
import { build } from "bun";
import { existsSync, readFileSync, cpSync, mkdirSync } from "fs";
import { join, basename, dirname } from "path";

const cwd = process.cwd();
const packageJsonPath = join(cwd, "package.json");

if (!existsSync(packageJsonPath)) {
  console.error("No package.json found in current directory");
  process.exit(1);
}

const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf-8"));
const appName = packageJson.name?.replace("@brains/", "") ?? basename(cwd);

const entrypoint = join(cwd, "brain.config.ts");

if (!existsSync(entrypoint)) {
  console.error(`Entry point not found: ${entrypoint}`);
  process.exit(1);
}

console.log(`Building ${appName}...`);

const result = await build({
  entrypoints: [entrypoint],
  outdir: join(cwd, "dist"),
  target: "bun",
  format: "esm",
  minify: true,
  sourcemap: "external",
  external: [
    // Native modules that cannot be bundled
    "@matrix-org/matrix-sdk-crypto-nodejs",
    "@libsql/client",
    "libsql",
    "lightningcss",
    "onnxruntime-node",
    "fastembed",
    "@tailwindcss/oxide",
  ],
});

if (!result.success) {
  console.error("Build failed:", result.logs);
  process.exit(1);
}

// Find monorepo root (directory containing bun.lock)
let monorepoRoot = cwd;
while (!existsSync(join(monorepoRoot, "bun.lock"))) {
  const parent = dirname(monorepoRoot);
  if (parent === monorepoRoot) {
    console.error("Could not find monorepo root");
    process.exit(1);
  }
  monorepoRoot = parent;
}

// Copy migration folders to dist
const distDir = join(cwd, "dist");
const migrationsDir = join(distDir, "migrations");
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

// Copy seed-content if it exists
const seedContentPath = join(cwd, "seed-content");
if (existsSync(seedContentPath)) {
  cpSync(seedContentPath, join(distDir, "seed-content"), { recursive: true });
  console.log("Copied seed-content");
}

console.log(`Build complete: dist/brain.config.js`);
