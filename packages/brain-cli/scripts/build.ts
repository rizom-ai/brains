#!/usr/bin/env bun
/**
 * Build @rizom/brain — single package with CLI + runtime + all brain models.
 *
 * Produces dist/brain.js (~7MB, Bun target) containing:
 * - CLI commands (init, start, list, eval, --remote)
 * - All brain model definitions (rover, ranger, relay)
 * - Full runtime (shell, plugins, entities, sites, themes)
 *
 * The entrypoint (src/entrypoint.ts) registers models and the boot function,
 * then runs the CLI. In the monorepo, src/index.ts runs instead (no models).
 */
import { writeFileSync, mkdirSync, cpSync, existsSync, readdirSync } from "fs";
import { join } from "path";

const outdir = join(import.meta.dir, "..", "dist");
mkdirSync(outdir, { recursive: true });

// ─── Find monorepo root ───────────────────────────────────────────────────

function findMonorepoRoot(): string {
  let dir = import.meta.dir;
  while (!existsSync(join(dir, "bun.lock"))) {
    const parent = join(dir, "..");
    if (parent === dir) {
      console.error("Build must run from the monorepo");
      process.exit(1);
    }
    dir = parent;
  }
  return dir;
}

const monorepoRoot = findMonorepoRoot();

// ─── Bundle ───────────────────────────────────────────────────────────────

console.log("Building @rizom/brain...");

const result = await Bun.build({
  entrypoints: [join(import.meta.dir, "entrypoint.ts")],
  outdir,
  target: "bun",
  format: "esm",
  minify: true,
  sourcemap: "none",
  external: [
    // Native modules that cannot be bundled
    "@libsql/client",
    "libsql",
    "lightningcss",
    "onnxruntime-node",
    "fastembed",
    "@tailwindcss/oxide",
    // ink loads react-devtools-core unconditionally
    "react-devtools-core",
    // MCP SDK for --remote mode (lazy imported)
    "@modelcontextprotocol/sdk",
  ],
  naming: "brain.js",
});

if (!result.success) {
  console.error("Build failed:");
  for (const log of result.logs) {
    console.error(log);
  }
  process.exit(1);
}

// Prepend shebang
const outFile = join(outdir, "brain.js");
const content = await Bun.file(outFile).text();
const stripped = content.replace(/^#!.*\n/gm, "");
writeFileSync(outFile, `#!/usr/bin/env bun\n${stripped}`);

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
  }
}

// ─── Copy seed content from all brain models ──────────────────────────────

const brainsDir = join(monorepoRoot, "brains");
const seedDir = join(outdir, "seed-content");
mkdirSync(seedDir, { recursive: true });

for (const model of readdirSync(brainsDir)) {
  const seedPath = join(brainsDir, model, "seed-content");
  if (existsSync(seedPath)) {
    cpSync(seedPath, join(seedDir, model), { recursive: true });
  }
}

// ─── Report ───────────────────────────────────────────────────────────────

const sizeKB = Math.round(stripped.length / 1024);
console.log(`Built dist/brain.js (${sizeKB}KB)`);
console.log(
  `Migrations: ${migrationSources
    .filter((s) => existsSync(s.path))
    .map((s) => s.name)
    .join(", ")}`,
);
console.log("Done.");
