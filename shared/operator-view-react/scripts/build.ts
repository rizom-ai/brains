import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createStylexBunTransform } from "@brains/build-tools";
import { runProcess } from "@brains/utils/run-process";

// Bun 1.4.0's JIT can drop the media tokenizer's EOF token once a large
// stylesheet warms it up, even in a single compilation pass. Isolate that
// engine workaround to this build process; callers and app runtimes keep JIT.
if (Bun.version === "1.4.0" && process.env["BUN_JSC_useJIT"] !== "0") {
  const compiler = await runProcess([process.execPath, import.meta.path], {
    env: { ...process.env, BUN_JSC_useJIT: "0" },
  });
  process.stdout.write(compiler.stdout);
  process.stderr.write(compiler.stderr);
  process.exit(compiler.exitCode);
}

const root = join(import.meta.dir, "..");
const outdir = join(root, "dist");
const stylex = createStylexBunTransform();
const options: Bun.BuildConfig = {
  entrypoints: [join(root, "src/index.ts")],
  target: "browser",
  format: "esm",
  jsx: { runtime: "automatic", development: false },
  external: [
    "react",
    "react/jsx-runtime",
    "react/jsx-dev-runtime",
    "@stylexjs/stylex",
  ],
  plugins: [stylex.plugin],
};
// Compile StyleX once, then embed its immutable stylesheet in the compiled JS.
// The embed pass needs no StyleX compiler and never retransforms source.
const collect = await Bun.build(options);
if (!collect.success)
  throw new AggregateError(
    collect.logs,
    "Could not compile operator components",
  );
const entry = collect.outputs.find((output) => output.kind === "entry-point");
if (!entry) throw new Error("Missing compiled operator entry");
const compiled = await entry.text();
const css = stylex.css();
await mkdir(outdir, { recursive: true });
const result = await Bun.build({
  ...options,
  entrypoints: ["compiled-operator-entry"],
  naming: { entry: "index.js" },
  outdir,
  define: { __OPERATOR_STYLEX_CSS__: JSON.stringify(css) },
  plugins: [
    {
      name: "embed-operator-stylesheet",
      setup(build): void {
        build.onResolve({ filter: /^compiled-operator-entry$/ }, () => ({
          path: "index.js",
          namespace: "compiled-operator",
        }));
        build.onLoad({ filter: /.*/, namespace: "compiled-operator" }, () => ({
          contents: compiled,
          loader: "js",
          resolveDir: root,
        }));
      },
    },
  ],
});
if (!result.success)
  throw new AggregateError(result.logs, "Could not build operator components");
if (!result.outputs.some((output) => output.path === join(outdir, "index.js")))
  throw new Error("Build did not emit the public operator entry");
await writeFile(join(outdir, "stylex.css"), css + "\n");
console.log("Built shared operator components and static StyleX CSS");
