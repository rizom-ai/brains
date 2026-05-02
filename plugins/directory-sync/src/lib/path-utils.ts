import { isAbsolute, relative, sep, join } from "path";

/**
 * Resolve a sync-relative path against the sync root. Absolute paths are left
 * unchanged so callers can accept either watcher paths or queued relative paths.
 */
export function resolveInSyncPath(syncPath: string, filePath: string): string {
  return isAbsolute(filePath) ? filePath : join(syncPath, filePath);
}

/**
 * Convert an absolute or sync-relative path to a normalized sync-relative path.
 */
export function toSyncRelativePath(syncPath: string, filePath: string): string {
  const fullPath = resolveInSyncPath(syncPath, filePath);
  const relativePath = relative(syncPath, fullPath);
  return sep === "/" ? relativePath : relativePath.split(sep).join("/");
}
