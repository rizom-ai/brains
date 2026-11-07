import { expect, it } from "bun:test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

it("exposes the Git broker acceptance matrix on the repository's Bun", async () => {
  const repoRoot = join(import.meta.dir, "..", "..", "..");
  const workflow = await readFile(
    join(repoRoot, ".github", "workflows", "directory-sync-import-soak.yml"),
    "utf8",
  );

  expect(workflow).toContain("git_broker_acceptance:");
  // One runtime: the acceptance matrix runs on the Bun the repository pins.
  expect(workflow).toContain("bun-version-file: package.json");
  expect(workflow).not.toContain("bun-version: ");
  expect(workflow).not.toContain("affected");
  expect(workflow).toContain("bun --version");
  expect(workflow).toContain("bun run test:git-broker-recovery");
  expect(workflow).toContain("bun run test:git-broker-process-inventory");
  expect(workflow).toContain("RUN_GIT_ZOMBIE_SOAK: 1");
  expect(workflow).toContain("GIT_ZOMBIE_SOAK_CYCLES: 100");
  expect(workflow).toContain("passes=3");
  expect(workflow).toContain("git-broker-acceptance.log");
  expect(workflow).not.toContain("retry");
});
