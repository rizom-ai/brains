import { readFile, rename, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

const BACKUP_FILENAME = "package.json.publish-backup";

export interface PreparePublishManifestOptions {
  /**
   * Directory whose node_modules tree resolves workspace dependency
   * versions. Defaults to the package directory itself; pass the real
   * workspace package dir when preparing a copied package outside the
   * workspace.
   */
  resolveFrom?: string;
}

type Manifest = Record<string, unknown>;

/**
 * Rewrite a package manifest into its publishable shape, backing up
 * the original next to it:
 *
 * - `workspace:` dependency ranges become concrete versions (npm
 *   publish does not rewrite the workspace protocol),
 * - `publishPeerDependencies` becomes `peerDependencies` (the in-repo
 *   manifest omits peers that would create workspace cycles),
 * - `publishExports` replaces `exports` (the in-repo exports may add
 *   source conditions that must not ship),
 * - `devDependencies` are dropped.
 */
export async function preparePublishManifest(
  packageDir: string,
  options: PreparePublishManifestOptions = {},
): Promise<void> {
  const manifestPath = join(packageDir, "package.json");
  const originalText = await readFile(manifestPath, "utf8");
  const manifest = JSON.parse(originalText) as Manifest;
  const resolveFrom = options.resolveFrom ?? packageDir;

  delete manifest["devDependencies"];

  if (manifest["publishPeerDependencies"] !== undefined) {
    manifest["peerDependencies"] = manifest["publishPeerDependencies"];
    delete manifest["publishPeerDependencies"];
  }

  if (manifest["publishExports"] !== undefined) {
    manifest["exports"] = manifest["publishExports"];
    delete manifest["publishExports"];
  }

  for (const field of [
    "dependencies",
    "peerDependencies",
    "optionalDependencies",
  ]) {
    const deps = manifest[field];
    if (!isRecord(deps)) {
      continue;
    }
    for (const [name, range] of Object.entries(deps)) {
      if (typeof range !== "string" || !range.startsWith("workspace:")) {
        continue;
      }
      deps[name] = await resolveWorkspaceRange(name, range, resolveFrom);
    }
  }

  await writeFile(join(packageDir, BACKUP_FILENAME), originalText);
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
}

export async function restorePublishManifest(
  packageDir: string,
): Promise<void> {
  const backupPath = join(packageDir, BACKUP_FILENAME);
  const exists = await stat(backupPath).then(
    () => true,
    () => false,
  );
  if (!exists) {
    throw new Error(
      `No publish manifest backup found at ${backupPath}; nothing to restore`,
    );
  }
  await rename(backupPath, join(packageDir, "package.json"));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function resolveWorkspaceRange(
  name: string,
  range: string,
  resolveFrom: string,
): Promise<string> {
  const version = await resolveWorkspaceVersion(name, resolveFrom);
  const modifier = range.slice("workspace:".length);
  if (modifier === "^" || modifier === "~") {
    return `${modifier}${version}`;
  }
  if (modifier === "*" || modifier === "") {
    return version;
  }
  return modifier;
}

async function resolveWorkspaceVersion(
  name: string,
  resolveFrom: string,
): Promise<string> {
  let dir = resolveFrom;
  for (;;) {
    const candidate = join(dir, "node_modules", name, "package.json");
    const text = await readFile(candidate, "utf8").catch(() => undefined);
    if (text !== undefined) {
      const version = (JSON.parse(text) as Manifest)["version"];
      if (typeof version !== "string") {
        throw new Error(`Workspace dependency ${name} has no version`);
      }
      return version;
    }
    const parent = dirname(dir);
    if (parent === dir) {
      throw new Error(
        `Could not resolve workspace dependency version for ${name} from ${resolveFrom}`,
      );
    }
    dir = parent;
  }
}
