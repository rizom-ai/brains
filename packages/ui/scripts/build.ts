import {
  assertProductionReactBundle,
  findInternalDeclarationImports,
  formatDeclarationLeakError,
  productionReactJsx,
} from "@brains/build-tools";
import { runProcess } from "@brains/utils/run-process";
import { readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import manifest from "../package.json";

const packageDir = join(import.meta.dir, "..");

/** Runtime packages the build leaves to the consumer's install. */
const externalPackages = [
  ...Object.keys(manifest.dependencies),
  ...Object.keys(manifest.peerDependencies),
];

/**
 * Build the published entry: one ESM bundle of `src/index.ts` and its
 * bundled declarations. The first-party entry (`src/internal.ts`) is never
 * built; packages in this repository bundle it from source.
 */
export async function buildPublicUi(outputDirectory: string): Promise<void> {
  await rm(outputDirectory, { recursive: true, force: true });

  const result = await Bun.build({
    entrypoints: [join(packageDir, "src/index.ts")],
    outdir: outputDirectory,
    target: "browser",
    format: "esm",
    splitting: false,
    minify: false,
    jsx: productionReactJsx,
    external: externalPackages.flatMap((name) => [name, `${name}/*`]),
  });
  if (!result.success) {
    throw new AggregateError(result.logs, "Could not build @rizom/brain-ui");
  }
  for (const output of result.outputs) {
    if (output.path.endsWith(".js")) {
      assertProductionReactBundle(await output.text(), output.path);
    }
  }

  const declarations = await runProcess(
    [
      "bun",
      "x",
      "rolldown",
      "-c",
      join(import.meta.dir, "bundle-declarations.mjs"),
    ],
    {
      cwd: packageDir,
      env: { ...process.env, OUTPUT_DIR: outputDirectory },
    },
  );
  if (declarations.exitCode !== 0) {
    throw new Error(
      `Declaration generation failed for @rizom/brain-ui\n${declarations.stdout}${declarations.stderr}`,
    );
  }

  for (const file of ["index.js", "index.d.ts"]) {
    const path = join(outputDirectory, file);
    const leaked = findInternalDeclarationImports(
      await readFile(path, "utf8"),
      {
        internalPrefixes: ["@brains/"],
      },
    );
    if (leaked.length > 0) {
      throw new Error(
        formatDeclarationLeakError(
          path,
          leaked,
          "A public component reaches a private workspace package; inline the shape it needs or keep the component in ./internal.",
        ),
      );
    }
  }
}

if (import.meta.main) {
  await buildPublicUi(join(packageDir, "dist"));
  console.log("Built @rizom/brain-ui");
}
