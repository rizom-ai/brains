import { mkdir } from "fs/promises";
import { dirname, join } from "path";

const packageRoot = join(import.meta.dir, "..");
const entrypoint = join(packageRoot, "ui-react", "src", "main.tsx");
const outdir = join(packageRoot, "dist", "ui");

await mkdir(outdir, { recursive: true });

const result = await Bun.build({
  entrypoints: [entrypoint],
  outdir,
  target: "browser",
  format: "esm",
  minify: true,
  sourcemap: "external",
  naming: "app.js",
});

if (!result.success) {
  for (const log of result.logs) {
    console.error(log);
  }
  process.exit(1);
}

console.log(`Built ${join(dirname(outdir), "ui", "app.js")}`);
