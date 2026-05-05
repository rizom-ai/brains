import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import dts from "rollup-plugin-dts";

const root = resolve(import.meta.dirname, "../../..");

// Source-of-truth mapping from npm name → workspace dir. Subpath aliases come
// from each package.json's `exports`, so adding/renaming a public subpath only
// requires editing that package.
const publicPackages = [
  { name: "@brains/app", dir: "shell/app" },
  { name: "@brains/entity-service", dir: "shell/entity-service" },
  { name: "@brains/templates", dir: "shell/templates" },
  { name: "@brains/utils", dir: "shared/utils" },
  { name: "@brains/site-composition", dir: "shared/site-composition" },
  { name: "@brains/theme-base", dir: "shared/theme-base" },
  { name: "@brains/plugins", dir: "shell/plugins" },
];

// Subpaths that exist for runtime/tooling reasons but must not be inlined into
// the public .d.ts surface.
const excludedSubpaths = new Set([
  "./test",
  "./migrate",
  "./hash",
  "./origin-ca",
  "./types",
]);

function resolveExportTarget(target) {
  if (typeof target === "string") return target;
  if (target && typeof target === "object") {
    return target.types ?? target.default ?? null;
  }
  return null;
}

function buildAliases() {
  const aliases = new Map();
  for (const { name, dir } of publicPackages) {
    const pkgPath = resolve(root, dir, "package.json");
    const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
    const exportsField = pkg.exports ?? {};
    for (const [subpath, target] of Object.entries(exportsField)) {
      if (excludedSubpaths.has(subpath)) continue;
      const file = resolveExportTarget(target);
      if (!file) continue;
      const alias = subpath === "." ? name : `${name}${subpath.slice(1)}`;
      aliases.set(alias, resolve(root, dir, file));
    }
  }
  return aliases;
}

const aliases = buildAliases();

export default {
  input: process.env.INPUT,
  output: { file: process.env.OUTPUT, format: "es" },
  plugins: [
    {
      name: "brain-dts-alias",
      resolveId(source) {
        if (source.endsWith(".css")) {
          return "\0brain-empty-css";
        }
        return aliases.get(source) ?? null;
      },
      load(id) {
        if (id === "\0brain-empty-css") {
          return "const content = ''; export default content;";
        }
        return null;
      },
    },
    dts({ respectExternal: false, compilerOptions: { stripInternal: true } }),
  ],
};
