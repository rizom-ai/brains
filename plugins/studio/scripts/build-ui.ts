import { mkdir, mkdtemp, rename, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import {
  createStylexBunTransform,
  parseUiBuildArgs,
} from "@brains/build-tools";
import { runProcessOrThrow } from "@brains/utils/run-process";
import { dirname, join, relative, resolve } from "node:path";

import {
  STUDIO_ENTRY_NAMING,
  studioAssetManifestSchema,
  studioStylesheetName,
} from "../src/ui-assets";

const require = createRequire(import.meta.url);
const packageRoot = join(import.meta.dir, "..");
const operatorRoot = join(packageRoot, "../../shared/operator-view-react");
const entrypoint = join(packageRoot, "ui-react", "src", "main.tsx");
const values = parseUiBuildArgs();
const destination = resolve(values.outdir ?? join(packageRoot, "dist", "ui"));
await mkdir(destination, { recursive: true });
const outdir = await mkdtemp(join(dirname(destination), ".studio-ui-"));
const operatorOutdir = join(outdir, ".operator");
await runProcessOrThrow(
  [process.execPath, "run", "build", "--outdir", operatorOutdir],
  {
    cwd: operatorRoot,
  },
);
const reactRoot = dirname(require.resolve("react/package.json"));
const reactDomRoot = dirname(require.resolve("react-dom/package.json"));
const reactAliases: Record<string, string> = {
  "@stylexjs/stylex": require.resolve("@stylexjs/stylex"),
  react: join(reactRoot, "index.js"),
  "react/jsx-runtime": join(reactRoot, "jsx-runtime.js"),
  "react/jsx-dev-runtime": join(reactRoot, "jsx-dev-runtime.js"),
  "react-dom": join(reactDomRoot, "index.js"),
  "react-dom/client": join(reactDomRoot, "client.js"),
};

const stylex = createStylexBunTransform();
const result = await Bun.build({
  entrypoints: [entrypoint],
  outdir,
  target: "browser",
  format: "esm",
  minify: true,
  splitting: true,
  sourcemap: "external",
  naming: {
    entry: STUDIO_ENTRY_NAMING,
    chunk: "studio-chunks/[name]-[hash].js",
    asset: "studio-chunks/[name]-[hash].[ext]",
  },
  plugins: [
    stylex.plugin,
    {
      // Pin every react specifier to one physical copy so hoisting can
      // never produce a dual-React bundle (same guard as web-chat).
      name: "private-ui-dependencies",
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
            resolveDir: operatorRoot,
          }),
        );
        build.onResolve(
          {
            filter:
              /^(@stylexjs\/stylex|react|react\/jsx-runtime|react\/jsx-dev-runtime|react-dom|react-dom\/client)$/,
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

const operatorCSS = await Bun.file(join(operatorOutdir, "stylex.css")).text();
const vendorCSS = await Bun.file(
  join(packageRoot, "ui-react/src/codemirror-vendor.css"),
).text();
const documentCSS = await Bun.file(
  join(packageRoot, "ui-react/src/studio-document.css"),
).text();
const stylesheet = `${vendorCSS}\n${stylex.css()}\n${operatorCSS}\n${documentCSS}\n`;
const stylexFile = studioStylesheetName(stylesheet);
await writeFile(join(outdir, stylexFile), stylesheet);
const outputFiles = [
  ...result.outputs.map((output) =>
    relative(outdir, output.path).replaceAll("\\", "/"),
  ),
  stylexFile,
].sort();
const assets: Record<string, string> = {};
for (const file of outputFiles) {
  assets[file] = file;
}
const script = outputFiles.find((file) =>
  /^studio-app-[a-zA-Z0-9]+\.js$/.test(file),
);
const manifest = studioAssetManifestSchema.parse({
  version: 2,
  entrypoints: { script, stylesheet: stylexFile },
  assets,
});
await writeFile(
  join(outdir, "studio-asset-manifest.json"),
  `${JSON.stringify(manifest, null, 2)}\n`,
);

// Publish complete files without removing assets being read by tests or open
// browser tabs during a concurrent CLI rebuild. Advertise the manifest last.
for (const file of [...outputFiles, "studio-asset-manifest.json"]) {
  const target = join(destination, file);
  await mkdir(dirname(target), { recursive: true });
  await rename(join(outdir, file), target);
}
await rm(outdir, { recursive: true, force: true });

console.log(
  `Built ${join(destination, manifest.entrypoints.script)} with ${outputFiles.length - 1} split assets`,
);
