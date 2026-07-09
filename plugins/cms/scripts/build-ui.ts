import { mkdir } from "fs/promises";
import { createRequire } from "module";
import { dirname, join } from "path";

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

await mkdir(outdir, { recursive: true });

const result = await Bun.build({
  entrypoints: [entrypoint],
  outdir,
  target: "browser",
  format: "esm",
  minify: true,
  sourcemap: "external",
  naming: "app.js",
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

console.log(`Built ${join(outdir, "app.js")}`);
