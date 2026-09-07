import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createStylexBunTransform } from "@brains/build-tools";

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
// Collect CSS first, then embed that immutable stylesheet in the server export.
// Both hosts execute compiled classes; neither evaluates stylex.create at runtime.
const collect = await Bun.build({
  ...options,
  define: { __OPERATOR_STYLEX_CSS__: JSON.stringify("") },
});
if (!collect.success)
  throw new AggregateError(
    collect.logs,
    "Could not compile operator components",
  );
const css = stylex.css();
await mkdir(outdir, { recursive: true });
const result = await Bun.build({
  ...options,
  outdir,
  define: { __OPERATOR_STYLEX_CSS__: JSON.stringify(css) },
});
if (!result.success)
  throw new AggregateError(result.logs, "Could not build operator components");
await writeFile(join(outdir, "stylex.css"), css + "\n");
console.log("Built shared operator components and static StyleX CSS");
