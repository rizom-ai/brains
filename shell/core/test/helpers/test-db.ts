import { mkdtemp, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";

/**
 * Create a temporary test directory for databases
 * Each test gets its own isolated directory
 */
export async function createTestDirectory(): Promise<{
  dir: string;
  cleanup: () => Promise<void>;
}> {
  // Create a unique temporary directory
  const dir = await mkdtemp(join(tmpdir(), "brain-test-"));

  // Cleanup function
  const cleanup = async (): Promise<void> => {
    await rm(dir, { recursive: true, force: true });
  };

  return { dir, cleanup };
}

