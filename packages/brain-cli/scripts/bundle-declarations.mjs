import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import dts from "rollup-plugin-dts";

const root = resolve(import.meta.dirname, "../../..");

// Internal workspace packages whose declarations are intentionally inlined into
// @rizom/brain's public .d.ts files. Subpath aliases come from each package's
// `exports`, but inclusion here is explicit policy: adding a package can expand
// the public type surface and should be reviewed deliberately.
const declarationInlinePackages = [
  // Runtime and app contracts exposed through the root/runtime entrypoints.
  { name: "@brains/app", dir: "shell/app" },
  // Entity/service authoring contracts surfaced by @rizom/brain/entities.
  { name: "@brains/entity-service", dir: "shell/entity-service" },
  // Template authoring contracts surfaced by @rizom/brain/templates.
  { name: "@brains/templates", dir: "shell/templates" },
  // Shared DTO/result contracts referenced by public authoring declarations.
  { name: "@brains/contracts", dir: "shared/contracts" },
  { name: "@brains/content-formatters", dir: "shared/content-formatters" },
  // Low-level schema/logger/markdown primitives used in public contracts.
  { name: "@brains/utils", dir: "shared/utils" },
  // Deploy helper types surfaced by @rizom/brain/deploy.
  { name: "@brains/deploy-support", dir: "shared/deploy-support" },
  // Site/theme composition contracts surfaced by site/interface declarations.
  { name: "@brains/site-composition", dir: "shared/site-composition" },
  { name: "@brains/theme-base", dir: "shared/theme-base" },
  // Plugin authoring contracts surfaced by @rizom/brain/plugins.
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
  for (const { name, dir } of declarationInlinePackages) {
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
