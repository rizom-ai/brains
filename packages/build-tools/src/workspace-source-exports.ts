import { existsSync, realpathSync } from "node:fs";
import { join, sep } from "node:path";
import type { BunPlugin } from "bun";
import { isJsonObject, parseJsonObject } from "./json";
import { readSourceManifestText } from "./publish-manifest";

export interface WorkspaceSourceExportsOptions {
  /** The workspace root whose node_modules links the workspace packages. */
  root: string;
}

/** Conditions a source export is read under, in the order a Bun build reads them. */
const SOURCE_CONDITIONS = ["bun", "import", "default"] as const;

/** The workspace package directory a bare package name links to, if any. */
function workspacePackageDir(root: string, name: string): string | undefined {
  const link = join(root, "node_modules", name);
  if (!existsSync(link)) return undefined;
  const target = realpathSync(link);
  // A registry install lives under node_modules; a workspace link does not.
  return target.split(sep).includes("node_modules") ? undefined : target;
}

function exportTarget(target: unknown): string | undefined {
  if (typeof target === "string") return target;
  if (!isJsonObject(target)) return undefined;
  const condition = SOURCE_CONDITIONS.find(
    (name) => typeof target[name] === "string",
  );
  const file = condition === undefined ? undefined : target[condition];
  return typeof file === "string" ? file : undefined;
}

interface SourceExports {
  dir: string;
  exports: Record<string, unknown>;
}

/**
 * A workspace package whose release rewrites its exports — it declares
 * `publishExports` — with the exports its source declares.
 */
function sourceExportsOf(dir: string): SourceExports | undefined {
  const manifest = parseJsonObject(
    readSourceManifestText(dir),
    `${dir}/package.json`,
  );
  const exports = manifest["exports"];
  if (manifest["publishExports"] === undefined || !isJsonObject(exports)) {
    return undefined;
  }
  return { dir, exports };
}

/**
 * Resolve workspace packages that publish rewritten exports from the exports
 * their source declares, whatever state their manifest is in.
 *
 * A core release prepares every publish manifest before `changeset publish`
 * and restores them afterwards, so a `prepublishOnly` build runs while each
 * prepared package exports only what it publishes. A first-party subpath
 * such as `@rizom/brain-ui/internal` then no longer resolves, and the brain's
 * bundle fails to build. With this plugin the build reads the backup the
 * preparation keeps, so it bundles the same source files in both states.
 */
export function workspaceSourceExports(
  options: WorkspaceSourceExportsOptions,
): BunPlugin {
  const packages = new Map<string, SourceExports | undefined>();
  const lookup = (name: string): SourceExports | undefined => {
    if (!packages.has(name)) {
      const dir = workspacePackageDir(options.root, name);
      packages.set(name, dir === undefined ? undefined : sourceExportsOf(dir));
    }
    return packages.get(name);
  };

  return {
    name: "workspace-source-exports",
    setup(build): void {
      build.onResolve({ filter: /^@[^/]+\/[^/]+(?:\/.*)?$/ }, (args) => {
        const [scope = "", name = "", ...rest] = args.path.split("/");
        const workspace = lookup(`${scope}/${name}`);
        if (workspace === undefined) return undefined;
        const subpath = rest.length === 0 ? "." : `./${rest.join("/")}`;
        const target = exportTarget(workspace.exports[subpath]);
        if (target === undefined) {
          throw new Error(
            `${args.path} is not exported by the source manifest of ${workspace.dir}`,
          );
        }
        return { path: join(workspace.dir, target) };
      });
    },
  };
}
