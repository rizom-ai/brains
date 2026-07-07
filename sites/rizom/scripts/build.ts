import {
  findInternalDeclarationImports,
  formatDeclarationLeakError,
} from "@brains/build-tools";
import { readFileSync } from "node:fs";
import { rm } from "node:fs/promises";
import { join } from "node:path";

const packageDir = join(import.meta.dir, "..");
const distDir = join(packageDir, "dist");

await rm(distDir, { recursive: true, force: true });

const result = await Bun.build({
  entrypoints: [join(packageDir, "src/index.ts")],
  outdir: distDir,
  target: "bun",
  format: "esm",
  splitting: false,
  sourcemap: "external",
  minify: false,
  external: ["preact", "preact/*", "clsx", "tailwind-merge"],
});

if (!result.success) {
  for (const log of result.logs) {
    console.error(log);
  }
  process.exit(1);
}

const declarationPath = join(distDir, "index.d.ts");
const declarationProcess = Bun.spawn(
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
      INPUT: join(packageDir, "src/index.ts"),
      OUTPUT: declarationPath,
    },
    stdout: "inherit",
    stderr: "inherit",
  },
);

const declarationExitCode = await declarationProcess.exited;
if (declarationExitCode !== 0) {
  console.error("Declaration generation failed for @rizom/site-rizom");
  process.exit(1);
}

const declaration = readFileSync(declarationPath, "utf8");
const leakedImports = findInternalDeclarationImports(declaration, {
  internalPrefixes: ["@brains/", "@rizom/"],
});
if (leakedImports.length > 0) {
  console.error(
    formatDeclarationLeakError(
      declarationPath,
      leakedImports,
      "Inline the source-owned public contract or remove the public export that exposes it.",
    ),
  );
  process.exit(1);
}
