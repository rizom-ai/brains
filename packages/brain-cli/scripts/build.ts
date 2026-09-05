#!/usr/bin/env bun
/**
 * Build @rizom/brain — single package with CLI + runtime + all brain models.
 *
 * Produces dist/brain.js (~7MB, Bun target) containing:
 * - CLI commands (init, start, list, eval, --remote)
 * - The canonical brain definition
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
  mkdtempSync,
  rmSync,
} from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { copyDeployScripts } from "@brains/deploy-support";
import {
  assertProductionReactBundle,
  findInternalDeclarationImports,
  formatDeclarationLeakError,
  productionReactJsx,
} from "@brains/build-tools";

const packageDir = join(import.meta.dir, "..");
const outdir = join(packageDir, "dist");
mkdirSync(outdir, { recursive: true });

const packageInstanceTsConfigPath = join(packageDir, "tsconfig.instance.json");

copyDeployScripts(join(packageDir, "templates", "deploy", "scripts"), [
  "create-predeploy-backup.ts",
  "install-health-watchdog.ts",
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
const webChatPackageDir = join(monorepoRoot, "interfaces", "web-chat");
const webChatUiAssetPath = join(webChatPackageDir, "dist", "ui", "app.js");
const webChatUiStylesheetPath = join(
  webChatPackageDir,
  "dist",
  "ui",
  "app.css",
);
const bundledWebChatUiDir = join(outdir, "ui");
const studioPackageDir = join(monorepoRoot, "plugins", "studio");
const studioUiDirectory = join(studioPackageDir, "dist", "ui");
const studioUiAssetPath = join(studioUiDirectory, "studio-app.js");
const studioUiManifestPath = join(
  studioUiDirectory,
  "studio-asset-manifest.json",
);
const onboardingContentSourceDir = join(
  monorepoRoot,
  "plugins",
  "onboarding",
  "content",
  "playbook",
);
const bundledOnboardingContentDir = join(outdir, "onboarding");
const sharedInstanceTsConfigPath = join(
  monorepoRoot,
  "shared",
  "typescript-config",
  "instance.json",
);

cpSync(sharedInstanceTsConfigPath, packageInstanceTsConfigPath);

console.log("Building bundled web chat UI...");
const webChatBuildResult = await Bun.spawn(["bun", "run", "build"], {
  cwd: webChatPackageDir,
  stdout: "inherit",
  stderr: "inherit",
}).exited;
if (webChatBuildResult !== 0) {
  console.error("Web chat UI build failed");
  process.exit(1);
}
if (!existsSync(webChatUiAssetPath)) {
  console.error(`Web chat UI asset not found at ${webChatUiAssetPath}`);
  process.exit(1);
}
if (!existsSync(webChatUiStylesheetPath)) {
  console.error(
    `Web chat UI stylesheet not found at ${webChatUiStylesheetPath}`,
  );
  process.exit(1);
}

console.log("Building bundled Studio editor UI...");
const studioBuildResult = await Bun.spawn(["bun", "run", "build"], {
  cwd: studioPackageDir,
  stdout: "inherit",
  stderr: "inherit",
}).exited;
if (studioBuildResult !== 0) {
  console.error("Studio editor UI build failed");
  process.exit(1);
}
if (!existsSync(studioUiAssetPath)) {
  console.error(`Studio editor UI asset not found at ${studioUiAssetPath}`);
  process.exit(1);
}
if (!existsSync(studioUiManifestPath)) {
  console.error(`Studio asset manifest not found at ${studioUiManifestPath}`);
  process.exit(1);
}

console.log("Generating canonical env schema...");
const envSchemaScript = join(
  import.meta.dir,
  "generate-canonical-env-schema.ts",
);
const envSchemaResult = await Bun.spawn(["bun", envSchemaScript], {
  cwd: monorepoRoot,
  stdout: "inherit",
  stderr: "inherit",
}).exited;
if (envSchemaResult !== 0) {
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
  // Keep MCP protocol classes in one runtime module. Bundling the server while
  // the handler and factory arrive through separate workspace paths duplicates
  // the SDK class identity and breaks modern server/discover negotiation.
  "@modelcontextprotocol/server",
  // MCP client for --remote mode (lazy imported)
  "@modelcontextprotocol/client",
  // React and React DOM MUST be externalized so brain.js, library exports,
  // and consumer site code share one runtime. A bundled second React copy
  // breaks context and hooks just as surely as it does in browser apps.
  // Every generated or external site consumer declares React as a peer or
  // direct dependency, while @rizom/brain supplies the server renderer.
  "react",
  "react/jsx-runtime",
  "react/jsx-dev-runtime",
  "react-dom",
  "react-dom/server",
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
    jsx: productionReactJsx,
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
  for (const output of result.outputs) {
    if (output.path.endsWith(".js")) {
      assertProductionReactBundle(await output.text(), output.path);
    }
  }
}

const libraryEntries = [
  {
    name: "index",
    source: join(import.meta.dir, "..", "src", "entries", "index.ts"),
  },
  {
    name: "model",
    source: join(import.meta.dir, "..", "src", "entries", "model.ts"),
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
    name: "chat",
    source: join(import.meta.dir, "..", "src", "entries", "chat.ts"),
  },
  {
    name: "templates",
    source: join(import.meta.dir, "..", "src", "entries", "templates.ts"),
  },
  {
    name: "deploy",
    source: join(import.meta.dir, "..", "src", "entries", "deploy.ts"),
  },
] as const;

async function bundleLibraries(): Promise<void> {
  // Build public subpaths together so shared runtime code (including Effect)
  // is emitted once instead of copied into every independently built bundle.
  rmSync(join(outdir, "chunks"), { recursive: true, force: true });
  const result = await Bun.build({
    entrypoints: libraryEntries.map((entry) => entry.source),
    outdir,
    target: "bun",
    format: "esm",
    minify: true,
    splitting: true,
    sourcemap: "linked",
    jsx: productionReactJsx,
    external: sharedExternals,
    naming: {
      entry: "[name].js",
      chunk: "chunks/[name]-[hash].js",
      asset: "chunks/[name]-[hash].[ext]",
    },
  });
  if (!result.success) {
    console.error("Public library bundle build failed:");
    for (const log of result.logs) {
      console.error(log);
    }
    process.exit(1);
  }
  for (const output of result.outputs) {
    if (output.path.endsWith(".js")) {
      assertProductionReactBundle(await output.text(), output.path);
    }
  }
}

async function emitLibraryDeclarations(): Promise<void> {
  const declarationOutDir = mkdtempSync(join(tmpdir(), "brain-cli-dts-"));
  try {
    await Promise.all(
      libraryEntries.map(async (entry) => {
        const proc = Bun.spawn(
          [
            "bun",
            "x",
            "rolldown",
            "-c",
            join(import.meta.dir, "bundle-declarations.mjs"),
          ],
          {
            cwd: packageDir,
            env: {
              ...process.env,
              INPUT: entry.source,
              OUTPUT_DIR: declarationOutDir,
            },
            stdout: "inherit",
            stderr: "inherit",
          },
        );
        const exitCode = await proc.exited;

        if (exitCode !== 0) {
          console.error(`Declaration generation failed for '${entry.name}'`);
          process.exit(1);
        }

        cpSync(
          join(declarationOutDir, `${entry.name}.d.ts`),
          join(outdir, `${entry.name}.d.ts`),
        );
      }),
    );

    for (const entry of libraryEntries) {
      const declarationPath = join(outdir, `${entry.name}.d.ts`);
      const declaration = readFileSync(declarationPath, "utf8");
      const leakedImports = findInternalDeclarationImports(declaration, {
        internalPrefixes: ["@brains/"],
      });
      if (leakedImports.length > 0) {
        console.error(
          formatDeclarationLeakError(
            declarationPath,
            leakedImports,
            [
              "If this package is part of the public declaration surface, add it to",
              "packages/brain-cli/scripts/bundle-declarations.mjs declarationInlinePackages.",
              "Otherwise, remove the public export path that exposes it.",
            ].join("\n"),
          ),
        );
        process.exit(1);
      }
    }
  } finally {
    rmSync(declarationOutDir, { recursive: true, force: true });
  }
}

const brokerBuild = bundle({
  name: "git-broker",
  source: join(import.meta.dir, "..", "src", "git-broker-entrypoint.ts"),
  sourcemap: "none",
}).then(() => {
  const outFile = join(outdir, "git-broker.js");
  const stripped = readFileSync(outFile, "utf8").replace(/^#!.*\n/gm, "");
  writeFileSync(outFile, `#!/usr/bin/env bun\n${stripped}`);
});

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

// Removed alpha authoring subpaths must not survive from an earlier build in
// the package-wide dist directory.
for (const legacySiteArtifact of [
  "site.js",
  "site.js.map",
  "site.d.ts",
  "site.d.ts.map",
]) {
  rmSync(join(outdir, legacySiteArtifact), { force: true });
}

const libraryBuild = bundleLibraries();

// Declarations only need source files; run them concurrently with bundling.
await Promise.all([
  brokerBuild,
  cliBuild,
  libraryBuild,
  emitLibraryDeclarations(),
]);

// ─── Copy package-owned onboarding assets ────────────────────────────────

rmSync(bundledOnboardingContentDir, { recursive: true, force: true });
cpSync(onboardingContentSourceDir, bundledOnboardingContentDir, {
  recursive: true,
});

// ─── Copy bundled web chat UI asset ───────────────────────────────────────

mkdirSync(bundledWebChatUiDir, { recursive: true });
cpSync(webChatUiAssetPath, join(bundledWebChatUiDir, "app.js"));
cpSync(webChatUiStylesheetPath, join(bundledWebChatUiDir, "app.css"));
const webChatSourceMapPath = `${webChatUiAssetPath}.map`;
if (existsSync(webChatSourceMapPath)) {
  cpSync(webChatSourceMapPath, join(bundledWebChatUiDir, "app.js.map"));
}
for (const retiredUiAsset of ["admin-app.js", "account-app.js"]) {
  rmSync(join(bundledWebChatUiDir, retiredUiAsset), { force: true });
  rmSync(join(bundledWebChatUiDir, `${retiredUiAsset}.map`), { force: true });
}
rmSync(join(bundledWebChatUiDir, "studio-chunks"), {
  recursive: true,
  force: true,
});
cpSync(studioUiDirectory, bundledWebChatUiDir, { recursive: true });

// ─── Copy migrations ──────────────────────────────────────────────────────

const migrationsDir = join(outdir, "migrations");
mkdirSync(migrationsDir, { recursive: true });

const migrationSources = [
  {
    name: "auth-service",
    path: join(monorepoRoot, "shell/auth-service/drizzle"),
  },
  {
    name: "entity-service",
    path: join(monorepoRoot, "shell/entity-service/drizzle"),
  },
  {
    name: "conversation-service",
    path: join(monorepoRoot, "shell/conversation-service/drizzle"),
  },
  { name: "job-queue", path: join(monorepoRoot, "shell/job-queue/drizzle") },
  {
    name: "runtime-state",
    path: join(monorepoRoot, "shell/runtime-state/drizzle"),
  },
];

for (const { name, path } of migrationSources) {
  if (existsSync(path)) {
    cpSync(path, join(migrationsDir, name), { recursive: true });
  }
}

// ─── Report ───────────────────────────────────────────────────────────────

function reportSize(name: string): void {
  const sizeKB = Math.round(Bun.file(join(outdir, `${name}.js`)).size / 1024);
  console.log(`Built dist/${name}.js (${sizeKB}KB)`);
}

reportSize("brain");
reportSize("git-broker");
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
