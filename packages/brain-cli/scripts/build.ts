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
import {
  writeFileSync,
  readFileSync,
  mkdirSync,
  cpSync,
  existsSync,
  readdirSync,
} from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const packageDir = join(import.meta.dir, "..");
const outdir = join(packageDir, "dist");
mkdirSync(outdir, { recursive: true });

const sharedDeployScriptsDir = dirname(
  fileURLToPath(
    import.meta.resolve("@brains/utils/deploy-scripts/provision-server.ts"),
  ),
);
const packageDeployScriptsDir = join(
  packageDir,
  "templates",
  "deploy",
  "scripts",
);
const packageInstanceTsConfigPath = join(packageDir, "tsconfig.instance.json");

function syncDeployScripts(): void {
  mkdirSync(packageDeployScriptsDir, { recursive: true });
  cpSync(
    join(sharedDeployScriptsDir, "provision-server.ts"),
    join(packageDeployScriptsDir, "provision-server.ts"),
  );
  cpSync(
    join(sharedDeployScriptsDir, "update-dns.ts"),
    join(packageDeployScriptsDir, "update-dns.ts"),
  );
  cpSync(
    join(sharedDeployScriptsDir, "write-ssh-key.ts"),
    join(packageDeployScriptsDir, "write-ssh-key.ts"),
  );
}

syncDeployScripts();

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
const sharedInstanceTsConfigPath = join(
  monorepoRoot,
  "shared",
  "typescript-config",
  "instance.json",
);

cpSync(sharedInstanceTsConfigPath, packageInstanceTsConfigPath);

console.log("Generating bundled model env schemas...");
const envSchemaScript = join(
  import.meta.dir,
  "generate-bundled-model-env-schemas.ts",
);
const envSchemaResult = Bun.spawnSync(["bun", envSchemaScript], {
  cwd: monorepoRoot,
  stdout: "inherit",
  stderr: "inherit",
});
if (envSchemaResult.exitCode !== 0) {
  console.error("Bundled model env schema generation failed");
  process.exit(1);
}

// ─── Bundle CLI + library exports ─────────────────────────────────────────
//
// The CLI bundle (brain.js) and one bundle per library subpath export
// (currently site/themes public subpaths; see docs/plans/external-plugin-api.md)
// are built in parallel — they're independent and write to different
// filenames in the same outdir.

console.log("Building @rizom/brain...");

// Native modules, lazy-loaded SDKs, and the JSX runtime.
const sharedExternals = [
  "@libsql/client",
  "libsql",
  "lightningcss",
  "@tailwindcss/oxide",
  // ink loads react-devtools-core unconditionally
  "react-devtools-core",
  // MCP SDK for --remote mode (lazy imported)
  "@modelcontextprotocol/sdk",
  // Preact and its subpaths MUST be externalized so brain.js, the
  // library exports (site.js), and consumer site code all share a
  // single preact instance. Bundling preact into brain.js creates a
  // second copy that diverges from the consumer's installed preact
  // at runtime; preact hooks (which rely on a module-level `options`
  // global) then crash with `D.context is undefined` when the
  // renderer's preact instance doesn't match the hook module's.
  //
  // Every consumer (brain init scaffold, standalone site repos) has
  // preact as a real dependency, so the externals always resolve.
  "preact",
  "preact/hooks",
  "preact/compat",
  "preact/jsx-runtime",
  "preact-render-to-string",
];

async function bundle(opts: {
  name: string;
  source: string;
  sourcemap: "none" | "linked";
}): Promise<void> {
  const result = await Bun.build({
    entrypoints: [opts.source],
    outdir,
    target: "bun",
    format: "esm",
    minify: true,
    sourcemap: opts.sourcemap,
    external: sharedExternals,
    naming: `${opts.name}.js`,
  });
  if (!result.success) {
    console.error(`Bundle '${opts.name}' failed:`);
    for (const log of result.logs) {
      console.error(log);
    }
    process.exit(1);
  }
}

const libraryEntries = [
  {
    name: "index",
    source: join(import.meta.dir, "..", "src", "entries", "index.ts"),
    types: join(import.meta.dir, "..", "src", "types", "index.d.ts"),
  },
  {
    name: "plugins",
    source: join(import.meta.dir, "..", "src", "entries", "plugins.ts"),
    types: join(import.meta.dir, "..", "src", "types", "plugins.d.ts"),
  },
  {
    name: "entities",
    source: join(import.meta.dir, "..", "src", "entries", "entities.ts"),
    types: join(import.meta.dir, "..", "src", "types", "entities.d.ts"),
  },
  {
    name: "services",
    source: join(import.meta.dir, "..", "src", "entries", "services.ts"),
    types: join(import.meta.dir, "..", "src", "types", "services.d.ts"),
  },
  {
    name: "interfaces",
    source: join(import.meta.dir, "..", "src", "entries", "interfaces.ts"),
    types: join(import.meta.dir, "..", "src", "types", "interfaces.d.ts"),
  },
  {
    name: "templates",
    source: join(import.meta.dir, "..", "src", "entries", "templates.ts"),
    types: join(import.meta.dir, "..", "src", "types", "templates.d.ts"),
  },
  {
    name: "utils",
    source: join(import.meta.dir, "..", "src", "entries", "utils.ts"),
    types: join(import.meta.dir, "..", "src", "types", "utils.d.ts"),
  },
  {
    name: "site",
    source: join(import.meta.dir, "..", "src", "entries", "site.ts"),
    types: join(import.meta.dir, "..", "src", "types", "site.d.ts"),
  },
  {
    name: "themes",
    source: join(import.meta.dir, "..", "src", "entries", "themes.ts"),
    types: join(import.meta.dir, "..", "src", "types", "themes.d.ts"),
  },
  {
    name: "deploy",
    source: join(import.meta.dir, "..", "src", "entries", "deploy.ts"),
    types: join(import.meta.dir, "..", "src", "types", "deploy.d.ts"),
  },
] as const;

const cliBuild = bundle({
  name: "brain",
  source: join(import.meta.dir, "entrypoint.ts"),
  sourcemap: "none",
}).then(() => {
  // Prepend shebang so the bundle is directly executable.
  const outFile = join(outdir, "brain.js");
  const stripped = readFileSync(outFile, "utf8").replace(/^#!.*\n/gm, "");
  writeFileSync(outFile, `#!/usr/bin/env bun\n${stripped}`);
});

const libraryBuilds = libraryEntries.map((entry) =>
  bundle({
    name: entry.name,
    source: entry.source,
    sourcemap: "linked",
  }).then(() => {
    // TEMPORARY: copy hand-written .d.ts. See entry.types and
    // docs/plans/external-plugin-api.md for the replacement plan.
    cpSync(entry.types, join(outdir, `${entry.name}.d.ts`));
  }),
);

await Promise.all([cliBuild, ...libraryBuilds]);

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

function reportSize(name: string): void {
  const sizeKB = Math.round(Bun.file(join(outdir, `${name}.js`)).size / 1024);
  console.log(`Built dist/${name}.js (${sizeKB}KB)`);
}

reportSize("brain");
for (const entry of libraryEntries) {
  reportSize(entry.name);
}

console.log(
  `Migrations: ${migrationSources
    .filter((s) => existsSync(s.path))
    .map((s) => s.name)
    .join(", ")}`,
);
console.log("Done.");
