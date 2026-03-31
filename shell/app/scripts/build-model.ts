#!/usr/bin/env bun
/**
 * Build a generic brain model image bundle.
 *
 * Usage: bun shell/app/scripts/build-model.ts <brain-model> [--output npm]
 * Example: bun shell/app/scripts/build-model.ts rover
 * Example: bun shell/app/scripts/build-model.ts rover --output npm
 *
 * Default output: dist/ with a self-contained bundle for Docker.
 * With --output npm: adds package.json for npm publish.
 *
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
  chmodSync,
} from "fs";
import { generateModelEntrypoint } from "../src/generate-entrypoint";
import { generateNpmPackageJson } from "../src/generate-npm-package";
import { join, dirname } from "path";

// ─── Args ──────────────────────────────────────────────────────────────────

const modelName = process.argv[2];
if (!modelName) {
  console.error("Usage: bun build-model.ts <brain-model> [--output npm]");
  console.error("Example: bun build-model.ts rover");
  console.error("Example: bun build-model.ts rover --output npm");
  process.exit(1);
}

const isNpmOutput =
  process.argv.includes("--output") &&
  process.argv[process.argv.indexOf("--output") + 1] === "npm";

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
      // ink imports react-devtools-core unconditionally but it's not always
      // installed as a transitive dep on CI. Mark external here, install in
      // package.prod.json for Docker runtime.
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

// ─── Assemble Docker build context ───────────────────────────────────────
// Creates a self-contained directory with everything Dockerfile.model needs,
// so `docker build` never touches the brain model's source tree.

const dockerCtx = join(brainModelDir, "docker-context");
const { rmSync } = await import("fs");
if (existsSync(dockerCtx)) rmSync(dockerCtx, { recursive: true, force: true });
mkdirSync(dockerCtx, { recursive: true });

// dist/ — the bundle
cpSync(outdir, join(dockerCtx, "dist"), { recursive: true });

// package.json — runtime native deps (from deploy/docker/package.prod.json)
const dockerDir = join(monorepoRoot, "deploy/docker");
const prodPkgPath = join(dockerDir, "package.prod.json");
if (existsSync(prodPkgPath)) {
  cpSync(prodPkgPath, join(dockerCtx, "package.json"));
}

// Caddyfile — reverse proxy config
const caddyfilePath = join(dockerDir, "Caddyfile");
if (existsSync(caddyfilePath)) {
  cpSync(caddyfilePath, join(dockerCtx, "Caddyfile"));
}

// seed-content/ (already inside dist/, symlink or copy to context root)
const distSeedContent = join(dockerCtx, "dist", "seed-content");
if (existsSync(distSeedContent)) {
  cpSync(distSeedContent, join(dockerCtx, "seed-content"), { recursive: true });
}

// public/ — static assets (empty dir is fine)
mkdirSync(join(dockerCtx, "public"), { recursive: true });

console.log(`Docker context: ${dockerCtx}`);
console.log(
  `  docker build -f deploy/docker/Dockerfile.model -t ${modelName} ${dockerCtx}`,
);

// ─── npm output: generate package.json + make bin executable ──────────────

if (isNpmOutput) {
  const npmPkg = generateNpmPackageJson(modelName, brainPkgJson.version);
  writeFileSync(
    join(outdir, "..", "package.json.npm"),
    JSON.stringify(npmPkg, null, 2) + "\n",
  );

  // Make entrypoint executable (bin entry)
  const entrypoint = join(outdir, ".model-entrypoint.js");
  const content = readFileSync(entrypoint, "utf-8");
  if (!content.startsWith("#!/")) {
    writeFileSync(entrypoint, `#!/usr/bin/env bun\n${content}`);
  }
  chmodSync(entrypoint, 0o755);

  console.log(
    `npm package.json written: ${join(outdir, "..", "package.json.npm")}`,
  );
  console.log(`To publish: cp package.json.npm package.json && npm publish`);
}

console.log(`Build complete: ${outdir}/.model-entrypoint.js`);
