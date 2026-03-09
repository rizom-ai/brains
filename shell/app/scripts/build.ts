#!/usr/bin/env bun
import { build } from "bun";
import { existsSync, readFileSync, writeFileSync, cpSync, mkdirSync } from "fs";
import { join, basename, dirname } from "path";

const cwd = process.cwd();
const packageJsonPath = join(cwd, "package.json");

if (!existsSync(packageJsonPath)) {
  console.error("No package.json found in current directory");
  process.exit(1);
}

const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf-8"));
const appName = packageJson.name?.replace("@brains/", "") ?? basename(cwd);

// Allow overriding brain.yaml path (e.g. --brain-yaml deploy/brain.yaml)
const brainYamlFlagIdx = process.argv.indexOf("--brain-yaml");
const brainYamlArg =
  brainYamlFlagIdx !== -1 ? process.argv[brainYamlFlagIdx + 1] : undefined;
const brainYamlPath = join(cwd, brainYamlArg ?? "brain.yaml");
const brainConfigPath = join(cwd, "brain.config.ts");
let entrypoint: string;
let generatedEntrypoint = false;

if (existsSync(brainYamlPath)) {
  // New brain.yaml flow — generate a static entrypoint
  const yamlContent = readFileSync(brainYamlPath, "utf-8");
  const brainMatch = yamlContent.match(/^brain:\s*["']?([^"'\n]+)["']?/m);
  if (!brainMatch?.[1]) {
    console.error('❌ brain.yaml must contain a "brain" field');
    process.exit(1);
  }
  const brainPackage = brainMatch[1].trim();

  // Generate a static entrypoint that the bundler can analyze
  const generatedCode = `
import definition from "${brainPackage}";
import { resolve, handleCLI, parseInstanceOverrides } from "@brains/app";
import { readFileSync } from "fs";
import { join } from "path";

const yaml = readFileSync(join(process.cwd(), "brain.yaml"), "utf-8");
const overrides = parseInstanceOverrides(yaml);
const config = resolve(definition, process.env, overrides);
await handleCLI(config);
`;
  entrypoint = join(cwd, ".brain-entrypoint.ts");
  writeFileSync(entrypoint, generatedCode);
  generatedEntrypoint = true;
  console.log(`Building ${appName} (brain.yaml → ${brainPackage})...`);
} else if (existsSync(brainConfigPath)) {
  // Legacy brain.config.ts flow
  entrypoint = brainConfigPath;
  console.log(`Building ${appName} (legacy brain.config.ts)...`);
} else {
  console.error(
    "❌ No brain.yaml or brain.config.ts found in current directory",
  );
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

try {
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
} finally {
  // Clean up generated entrypoint
  if (generatedEntrypoint && existsSync(entrypoint)) {
    const { unlinkSync } = await import("fs");
    unlinkSync(entrypoint);
  }
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

// Copy brain.yaml to dist (needed at runtime)
if (existsSync(brainYamlPath)) {
  cpSync(brainYamlPath, join(distDir, "brain.yaml"));
  console.log("Copied brain.yaml");
}

// Copy seed-content if it exists (check brain package too)
const seedContentPath = join(cwd, "seed-content");
if (existsSync(seedContentPath)) {
  cpSync(seedContentPath, join(distDir, "seed-content"), { recursive: true });
  console.log("Copied seed-content");
}

const outputName = existsSync(brainYamlPath)
  ? ".brain-entrypoint.js"
  : "brain.config.js";
console.log(`Build complete: dist/${outputName}`);
