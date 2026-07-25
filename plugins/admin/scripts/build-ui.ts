import { mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

const require = createRequire(import.meta.url);
const packageRoot = join(import.meta.dir, "..");
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

await mkdir(outdir, { recursive: true });

// The admin and account surfaces ship as separate bundles from one package:
// a non-admin browser must never download the admin SPA.
const bundles = [
  { entry: join("ui-react", "src", "main.tsx"), name: "admin-app.js" },
  {
    entry: join("ui-react", "src", "account", "main.tsx"),
    name: "account-app.js",
  },
];

for (const bundle of bundles) {
  const result = await Bun.build({
    entrypoints: [join(packageRoot, bundle.entry)],
    outdir,
    target: "browser",
    format: "esm",
    minify: true,
    sourcemap: "external",
    naming: bundle.name,
    plugins: [
      {
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
    for (const log of result.logs) console.error(log);
    process.exit(1);
  }
  console.log(`Built ${join(outdir, bundle.name)}`);
}
