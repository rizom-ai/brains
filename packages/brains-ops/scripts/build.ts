#!/usr/bin/env bun
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

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

await bundle({
  name: "brains-ops",
  source: join(packageDir, "src", "entrypoint.ts"),
  sourcemap: "none",
});

await bundle({
  name: "index",
  source: join(packageDir, "src", "index.ts"),
  sourcemap: "none",
});

const binPath = join(outdir, "brains-ops.js");
const stripped = readFileSync(binPath, "utf8").replace(/^#!.*\n/gm, "");
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

console.log("Built dist/brains-ops.js");
console.log("Built dist/index.js");
