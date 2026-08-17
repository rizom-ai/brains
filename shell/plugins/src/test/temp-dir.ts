import { afterAll } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * Directories handed out but not yet removed.
 *
 * These helpers previously returned a bare path and left removal to the
 * caller, which no caller did: a full suite run left tens of thousands of
 * directories in the system temp dir, and enough of them to exhaust the disk.
 * Tracking them here fixes every call site at once, rather than asking
 * nineteen of them to remember.
 */
const trackedDirs: string[] = [];
let cleanupArmed = false;

/**
 * Arm cleanup for the scope the caller is running in, once per scope.
 *
 * It has to be `afterAll` rather than a process hook: bun's test runner fires
 * neither `exit` nor `beforeExit`, so a process-level handler never runs and
 * the directories survive.
 *
 * And it has to re-arm rather than register once at module load: bun evaluates
 * this module once per *process*, not once per file, and runs a package's test
 * files in one process. A single module-scope registration therefore only
 * covers whichever file imported first, and every later file leaks. Disarming
 * inside the hook makes the next file register its own.
 */
function track(dir: string): string {
  trackedDirs.push(dir);
  if (!cleanupArmed) {
    cleanupArmed = true;
    afterAll(() => {
      cleanupArmed = false;
      removeTrackedTempDataDirs();
    });
  }
  return dir;
}

/**
 * Remove every directory these helpers created and forget them.
 *
 * Runs automatically after each test file; exported so a test can
 * force it, and so this behaviour is itself testable.
 */
export function removeTrackedTempDataDirs(): void {
  trackedDirs.splice(0).forEach((dir) => {
    rmSync(dir, { recursive: true, force: true });
  });
}

/**
 * Create a unique temp directory for test data. Removed after the test file.
 */
export async function createTempDataDir(
  prefix = "brains-test-",
): Promise<string> {
  return track(await mkdtemp(join(tmpdir(), prefix)));
}

/**
 * Synchronous variant for tests that set up state outside async hooks.
 */
export function createTempDataDirSync(prefix = "brains-test-"): string {
  return track(mkdtempSync(join(tmpdir(), prefix)));
}
