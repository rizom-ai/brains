import { mkdtemp, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";

export async function createTestDirectory(): Promise<{
  dir: string;
  cleanup: () => Promise<void>;
}> {
  const dir = await mkdtemp(join(tmpdir(), "brain-test-"));
  const cleanup = async (): Promise<void> => {
    await rm(dir, { recursive: true, force: true });
  };
  return { dir, cleanup };
}
