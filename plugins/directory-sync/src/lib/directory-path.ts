import { mkdir } from "fs/promises";
import { isAbsolute, resolve } from "path";

export function resolveSyncPath(syncPath: string): string {
  return isAbsolute(syncPath) ? syncPath : resolve(process.cwd(), syncPath);
}

export async function ensureSyncPath(syncPath: string): Promise<void> {
  await mkdir(syncPath, { recursive: true });
}
