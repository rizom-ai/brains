import { existsSync } from "fs";
import { join } from "path";

const LOCAL_BRAIN_PATH = join(
  "node_modules",
  "@rizom",
  "brain",
  "dist",
  "brain.js",
);

/**
 * Check if a local @rizom/brain installation exists.
 * Returns the path to the local brain.js, or undefined.
 */
export function findLocalBrain(cwd: string): string | undefined {
  const localPath = join(cwd, LOCAL_BRAIN_PATH);
  return existsSync(localPath) ? localPath : undefined;
}
