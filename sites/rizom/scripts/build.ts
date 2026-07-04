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

await Bun.write(
  join(distDir, "index.d.ts"),
  [
    'export * from "../src/index";',
    'export { default } from "../src/index";',
    "",
  ].join("\n"),
);
