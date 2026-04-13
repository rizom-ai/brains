#!/usr/bin/env bun
import {
  cpSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const packageDir = join(import.meta.dir, "..");
const outdir = join(packageDir, "dist");

rmSync(outdir, { recursive: true, force: true });
mkdirSync(outdir, { recursive: true });

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

await Promise.all([
  bundle({
    name: "brains-ops",
    source: join(packageDir, "src", "entrypoint.ts"),
    sourcemap: "none",
  }),
  bundle({
    name: "index",
    source: join(packageDir, "src", "index.ts"),
    sourcemap: "none",
  }),
  bundle({
    name: "deploy",
    source: join(packageDir, "src", "entries", "deploy.ts"),
    sourcemap: "none",
  }),
]);

const binPath = join(outdir, "brains-ops.js");
const stripped = readFileSync(binPath, "utf8").replace(/^#!.*\n/, "");
writeFileSync(binPath, `#!/usr/bin/env bun\n${stripped}`);

const dts = Bun.spawnSync(
  ["bunx", "tsc", "-p", join(packageDir, "tsconfig.dts.json")],
  {
    cwd: packageDir,
    stdout: "inherit",
    stderr: "inherit",
  },
);

if (dts.exitCode !== 0) {
  console.error("Declaration build failed");
  process.exit(1);
}

cpSync(
  join(packageDir, "src", "types", "deploy.d.ts"),
  join(outdir, "deploy.d.ts"),
);

const sharedDeployTemplatesDir = dirname(
  fileURLToPath(
    import.meta.resolve("@brains/utils/deploy-templates/Dockerfile"),
  ),
);
const templateDeployDir = join(
  packageDir,
  "templates",
  "rover-pilot",
  "deploy",
);
cpSync(
  join(sharedDeployTemplatesDir, "Dockerfile"),
  join(templateDeployDir, "Dockerfile"),
);
cpSync(
  join(sharedDeployTemplatesDir, "Caddyfile"),
  join(templateDeployDir, "Caddyfile"),
);

console.log("Built dist/brains-ops.js");
console.log("Built dist/index.js");
console.log("Built dist/deploy.js");
