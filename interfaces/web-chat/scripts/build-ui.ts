import { existsSync } from "fs";
import { mkdir, mkdtemp, rm } from "fs/promises";
import { createRequire } from "module";
import {
  createStylexBunTransform,
  parseUiBuildArgs,
  writeBuildFileAtomically,
} from "@brains/build-tools";
import { dirname, join, relative, resolve } from "path";

const require = createRequire(import.meta.url);
const packageRoot = join(import.meta.dir, "..");
const aliasRoot = packageRoot;
const values = parseUiBuildArgs();
const outdir = resolve(values.outdir ?? join(packageRoot, "dist", "ui"));
const reactRoot = dirname(require.resolve("react/package.json"));
const reactDomRoot = dirname(require.resolve("react-dom/package.json"));
const reactAliases: Record<string, string> = {
  react: join(reactRoot, "index.js"),
  "react/jsx-runtime": join(reactRoot, "jsx-runtime.js"),
  "react/jsx-dev-runtime": join(reactRoot, "jsx-dev-runtime.js"),
  "react-dom": join(reactDomRoot, "index.js"),
  "react-dom/client": join(reactDomRoot, "client.js"),
};

await mkdir(dirname(outdir), { recursive: true });
// A sibling staging directory keeps source-map relative paths unchanged.
const staging = await mkdtemp(join(dirname(outdir), ".web-chat-ui-"));
try {
  for (const [entryName, assetName] of [
    ["main", "app"],
    ["guest-box", "guest"],
    ["guest-dashboard", "dashboard"],
  ] as const) {
  const entrypoint = join(packageRoot, "ui-react", "src", `${entryName}.tsx`);
  const stylex = createStylexBunTransform();
  const result = await Bun.build({
    entrypoints: [entrypoint],
    outdir: staging,
    target: "browser",
    format: "esm",
    minify: true,
    sourcemap: "external",
    naming: `${assetName}.[ext]`,
    plugins: [
      stylex.plugin,
      {
        name: "web-chat-aliases",
        setup(build): void {
          build.onResolve({ filter: /^@\// }, (args) => {
            const resolved = join(aliasRoot, args.path.slice(2));
            for (const candidate of [
              resolved,
              `${resolved}.tsx`,
              `${resolved}.ts`,
            ]) {
              if (existsSync(candidate)) return { path: candidate };
            }
            return { path: resolved };
          });
        },
      },
      {
        name: "dedupe-react",
        setup(build): void {
          build.onResolve(
            {
              filter:
                /^(react|react\/jsx-runtime|react\/jsx-dev-runtime|react-dom|react-dom\/client)$/,
            },
            (args) => ({ path: reactAliases[args.path] }),
          );
        },
      },
    ],
  });

  if (!result.success) {
    for (const log of result.logs) {
      console.error(log);
    }
    throw new Error("Web chat UI build failed");
  }

  const bundledStyles = result.outputs.find((output) =>
    output.path.endsWith(`/${assetName}.css`),
  );
  for (const output of result.outputs) {
    if (output === bundledStyles) continue;
    await writeBuildFileAtomically(
      join(outdir, relative(staging, output.path)),
      new Uint8Array(await output.arrayBuffer()),
    );
  }
  await writeBuildFileAtomically(
    join(outdir, `${assetName}.css`),
    `${stylex.css()}\n${(await bundledStyles?.text()) ?? ""}`,
  );
  console.log(`Built ${join(outdir, `${assetName}.js`)} and ${assetName}.css`);
  }
} finally {
  await rm(staging, { recursive: true, force: true });
}
