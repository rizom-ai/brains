import { mkdtempSync } from "node:fs";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * Create a unique temp directory for test data.
 */
export function createTempDataDir(prefix = "brains-test-"): Promise<string> {
  return mkdtemp(join(tmpdir(), prefix));
}

/**
 * Synchronous variant for tests that set up state outside async hooks.
 */
export function createTempDataDirSync(prefix = "brains-test-"): string {
  return mkdtempSync(join(tmpdir(), prefix));
}
