import { promises as fs } from "fs";
import { isErrnoException } from "@brains/utils/predicates";
import { join, relative, sep } from "path";

/**
 * Ceiling on the total bytes read out of the app `public/` directory.
 *
 * The snapshot is held in memory for the whole build and base64 inflates it by
 * a further third, so an unbounded tree turns an operator dropping a large file
 * into `public/` into an out-of-memory crash. The largest real site output
 * measures ~18 MB, so this leaves ample headroom while still failing with an
 * actionable diagnostic well before the process is at risk.
 */
export const MAX_PUBLIC_ASSET_SNAPSHOT_BYTES: number = 64 * 1024 * 1024;

interface SnapshotBudget {
  totalBytes: number;
  maxTotalBytes: number;
}

/**
 * Read app-owned public files into the serializable build snapshot.
 * Values are base64 so binary assets survive a JSON round trip unchanged.
 */
export async function snapshotPublicAssets(
  publicDir: string,
  signal: AbortSignal,
  maxTotalBytes: number = MAX_PUBLIC_ASSET_SNAPSHOT_BYTES,
): Promise<Record<string, string>> {
  signal.throwIfAborted();

  try {
    await fs.access(publicDir);
  } catch (error) {
    if (isNotFoundError(error)) return {};
    throw error;
  }

  const assets: Record<string, string> = {};
  await collectPublicAssets(publicDir, publicDir, assets, signal, {
    totalBytes: 0,
    maxTotalBytes,
  });
  return assets;
}

async function collectPublicAssets(
  publicDir: string,
  directory: string,
  assets: Record<string, string>,
  signal: AbortSignal,
  budget: SnapshotBudget,
): Promise<void> {
  signal.throwIfAborted();
  const entries = await fs.readdir(directory, { withFileTypes: true });
  entries.sort((left, right) => left.name.localeCompare(right.name));

  for (const entry of entries) {
    signal.throwIfAborted();
    const sourcePath = join(directory, entry.name);
    const assetPath = relative(publicDir, sourcePath).split(sep).join("/");

    if (entry.isSymbolicLink()) {
      throw new Error(`Public asset cannot be a symbolic link: ${assetPath}`);
    }
    if (entry.isDirectory()) {
      await collectPublicAssets(publicDir, sourcePath, assets, signal, budget);
      continue;
    }
    if (!entry.isFile()) continue;

    // Size the file before reading it: the point of the budget is to avoid
    // pulling an oversized file into memory at all, so stat has to gate read.
    const { size } = await fs.stat(sourcePath);
    budget.totalBytes += size;
    if (budget.totalBytes > budget.maxTotalBytes) {
      throw new Error(
        `App public assets exceed the ${budget.maxTotalBytes} byte snapshot budget at "${assetPath}". ` +
          `Large files belong in the shared image cache or behind a CDN rather than in public/.`,
      );
    }

    assets[assetPath] = (await fs.readFile(sourcePath)).toString("base64");
  }
}

function isNotFoundError(error: unknown): boolean {
  return isErrnoException(error) && error.code === "ENOENT";
}
