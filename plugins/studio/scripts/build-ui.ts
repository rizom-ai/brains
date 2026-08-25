import { mkdir, rm, writeFile } from "fs/promises";
import { createRequire } from "module";
import { dirname, join, relative } from "path";

const require = createRequire(import.meta.url);
const packageRoot = join(import.meta.dir, "..");
const entrypoint = join(packageRoot, "ui-react", "src", "main.tsx");
const outdir = join(packageRoot, "dist", "ui");
const reactRoot = dirname(require.resolve("react/package.json"));
const reactDomRoot = dirname(require.resolve("react-dom/package.json"));
const reactAliases: Record<string, string> = {
  react: join(reactRoot, "index.js"),
  "react/jsx-runtime": join(reactRoot, "jsx-runtime.js"),
  "react/jsx-dev-runtime": join(reactRoot, "jsx-dev-runtime.js"),
  "react-dom": join(reactDomRoot, "index.js"),
  "react-dom/client": join(reactDomRoot, "client.js"),
};

await rm(outdir, { recursive: true, force: true });
await mkdir(outdir, { recursive: true });

const result = await Bun.build({
  entrypoints: [entrypoint],
  outdir,
  target: "browser",
  format: "esm",
  minify: true,
  splitting: true,
  sourcemap: "external",
  naming: {
    entry: "studio-app.js",
    chunk: "studio-chunks/[name]-[hash].js",
    asset: "studio-chunks/[name]-[hash].[ext]",
  },
  plugins: [
    {
      // Pin every react specifier to one physical copy so hoisting can
      // never produce a dual-React bundle (same guard as web-chat).
      name: "dedupe-react",
      setup(build): void {
        build.onResolve(
          {
            filter:
              /^(react|react\/jsx-runtime|react\/jsx-dev-runtime|react-dom|react-dom\/client)$/,
          },
          (args) => ({ path: reactAliases[args.path] ?? args.path }),
        );
      },
    },
  ],
});

if (!result.success) {
  for (const log of result.logs) {
    console.error(log);
  }
  process.exit(1);
}

const outputFiles = result.outputs
  .map((output) => relative(outdir, output.path).replaceAll("\\", "/"))
  .sort();
const assets: Record<string, string> = {};
for (const file of outputFiles) {
  const publicPath = file === "studio-app.js" ? "app.js" : file;
  assets[publicPath] = file;
}
await writeFile(
  join(outdir, "studio-asset-manifest.json"),
  `${JSON.stringify({ version: 1, assets }, null, 2)}\n`,
);

console.log(
  `Built ${join(outdir, "studio-app.js")} with ${outputFiles.length - 1} split assets`,
);
