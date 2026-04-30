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
  mkdtempSync,
  rmSync,
} from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { copyDeployScripts } from "@brains/deploy-templates";

const packageDir = join(import.meta.dir, "..");
const outdir = join(packageDir, "dist");
mkdirSync(outdir, { recursive: true });

const packageInstanceTsConfigPath = join(packageDir, "tsconfig.instance.json");

copyDeployScripts(join(packageDir, "templates", "deploy", "scripts"), [
  "provision-server.ts",
  "update-dns.ts",
  "write-ssh-key.ts",
]);

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
// The CLI bundle (brain.js) and one bundle per library subpath export are built
// in parallel — they're independent and write to different filenames in the
// same outdir. Public declarations are emitted from the matching source entries
// instead of copied from hand-written stubs.

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
  },
  {
    name: "plugins",
    source: join(import.meta.dir, "..", "src", "entries", "plugins.ts"),
  },
  {
    name: "entities",
    source: join(import.meta.dir, "..", "src", "entries", "entities.ts"),
  },
  {
    name: "services",
    source: join(import.meta.dir, "..", "src", "entries", "services.ts"),
  },
  {
    name: "interfaces",
    source: join(import.meta.dir, "..", "src", "entries", "interfaces.ts"),
  },
  {
    name: "templates",
    source: join(import.meta.dir, "..", "src", "entries", "templates.ts"),
  },
  {
    name: "site",
    source: join(import.meta.dir, "..", "src", "entries", "site.ts"),
  },
  {
    name: "themes",
    source: join(import.meta.dir, "..", "src", "entries", "themes.ts"),
  },
  {
    name: "deploy",
    source: join(import.meta.dir, "..", "src", "entries", "deploy.ts"),
  },
] as const;

function emitLibraryDeclarations(): void {
  const declarationOutDir = mkdtempSync(join(tmpdir(), "brain-cli-dts-"));
  try {
    for (const entry of libraryEntries) {
      if (entry.name === "site") {
        cpSync(
          join(packageDir, "src", "types", "site.d.ts"),
          join(outdir, "site.d.ts"),
        );
        continue;
      }

      const result = Bun.spawnSync(
        [
          "bun",
          "x",
          "rollup",
          "-c",
          join(import.meta.dir, "bundle-declarations.mjs"),
        ],
        {
          cwd: packageDir,
          env: {
            ...process.env,
            INPUT: entry.source,
            OUTPUT: join(declarationOutDir, `${entry.name}.d.ts`),
          },
          stdout: "inherit",
          stderr: "inherit",
        },
      );

      if (result.exitCode !== 0) {
        console.error(`Declaration generation failed for '${entry.name}'`);
        process.exit(1);
      }

      cpSync(
        join(declarationOutDir, `${entry.name}.d.ts`),
        join(outdir, `${entry.name}.d.ts`),
      );
    }

    for (const entry of libraryEntries) {
      const declarationPath = join(outdir, `${entry.name}.d.ts`);
      const declaration = readFileSync(declarationPath, "utf8");
      if (declaration.includes("@brains/")) {
        console.error(
          `Generated declaration '${entry.name}.d.ts' leaks an internal @brains/* import`,
        );
        process.exit(1);
      }
    }
  } finally {
    rmSync(declarationOutDir, { recursive: true, force: true });
  }
}

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
  }),
);

await Promise.all([cliBuild, ...libraryBuilds]);
emitLibraryDeclarations();

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
