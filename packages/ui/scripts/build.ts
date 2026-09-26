import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  findInternalDeclarationImports,
  writeBuildFileAtomically,
} from "@brains/build-tools";
import { runProcessOrThrow } from "@brains/utils/run-process";
import manifest from "../package.json";

const root = join(import.meta.dir, "..");
// Reuse the compiled presentation components; no StyleX compiler or private
// workspace imports are required in an external author's build.
const stage = await mkdtemp(join(tmpdir(), "brain-ui-build-"));
try {
  const operatorOutdir = join(stage, "operator");
  await runProcessOrThrow(
    [process.execPath, "run", "build", "--outdir", operatorOutdir],
    {
      cwd: join(root, "../../shared/operator-view-react"),
    },
  );
  const result = await Bun.build({
    entrypoints: [join(root, "src/public.ts")],
    outdir: stage,
    naming: { entry: "index.js" },
    target: "browser",
    format: "esm",
    jsx: { runtime: "automatic", development: false },
    plugins: [
      {
        name: "private-operator-artifact",
        setup(build): void {
          build.onResolve({ filter: /^@brains\/operator-view-react$/ }, () => ({
            path: "index.js",
            namespace: "compiled-operator",
          }));
          build.onLoad(
            { filter: /.*/, namespace: "compiled-operator" },
            async () => ({
              contents: await Bun.file(join(operatorOutdir, "index.js")).text(),
              loader: "js",
              resolveDir: join(root, "../../shared/operator-view-react"),
            }),
          );
        },
      },
    ],
    external: [
      ...Object.keys(manifest.dependencies),
      ...Object.keys(manifest.peerDependencies),
      "react/jsx-runtime",
      "react/jsx-dev-runtime",
    ],
  });
  if (!result.success)
    throw new AggregateError(result.logs, "Could not compile public UI");
  await runProcessOrThrow(
    [
      process.execPath,
      "x",
      "rolldown",
      "-c",
      join(import.meta.dir, "bundle-declarations.mjs"),
    ],
    { cwd: root, env: { ...process.env, OUTPUT_DIR: stage } },
  );
  for (const file of ["index.js", "index.d.ts"]) {
    const content = await readFile(join(stage, file), "utf8");
    const leaks = findInternalDeclarationImports(content, {
      internalPrefixes: ["@brains/"],
    });
    if (leaks.length)
      throw new Error(
        `Public UI ${file} leaks private imports: ${leaks.join(", ")}`,
      );
    await writeBuildFileAtomically(join(root, "dist", file), content);
  }
} finally {
  await rm(stage, { recursive: true, force: true });
}
console.log("Built standalone Brain UI JavaScript and declarations");
