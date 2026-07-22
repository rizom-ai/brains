import { promises as fs } from "fs";
import { join, relative, sep } from "path";

/**
 * Read app-owned public files into the serializable build snapshot.
 * Values are base64 so binary assets survive a JSON round trip unchanged.
 */
export async function snapshotPublicAssets(
  publicDir: string,
  signal?: AbortSignal,
): Promise<Record<string, string>> {
  signal?.throwIfAborted();

  try {
    await fs.access(publicDir);
  } catch (error) {
    if (isNotFoundError(error)) return {};
    throw error;
  }

  const assets: Record<string, string> = {};
  await collectPublicAssets(publicDir, publicDir, assets, signal);
  return assets;
}

async function collectPublicAssets(
  publicDir: string,
  directory: string,
  assets: Record<string, string>,
  signal?: AbortSignal,
): Promise<void> {
  signal?.throwIfAborted();
  const entries = await fs.readdir(directory, { withFileTypes: true });
  entries.sort((left, right) => left.name.localeCompare(right.name));

  for (const entry of entries) {
    signal?.throwIfAborted();
    const sourcePath = join(directory, entry.name);
    const assetPath = relative(publicDir, sourcePath).split(sep).join("/");

    if (entry.isSymbolicLink()) {
      throw new Error(`Public asset cannot be a symbolic link: ${assetPath}`);
    }
    if (entry.isDirectory()) {
      await collectPublicAssets(publicDir, sourcePath, assets, signal);
      continue;
    }
    if (!entry.isFile()) continue;

    assets[assetPath] = (await fs.readFile(sourcePath)).toString("base64");
  }
}

function isNotFoundError(error: unknown): boolean {
  return (
    error instanceof Error &&
    "code" in error &&
    (error as NodeJS.ErrnoException).code === "ENOENT"
  );
}
