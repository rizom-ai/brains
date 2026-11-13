import { access } from "node:fs/promises";

/** Whether a path can be reached; any failure to reach it counts as absent. */
export async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

/** A path with forward slashes, as the registry and its reports write one. */
export function normalizePath(path: string): string {
  return path.replaceAll("\\", "/");
}
