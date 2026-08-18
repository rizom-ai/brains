import { expect, it } from "bun:test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

it("exposes the approved affected-runtime broker acceptance matrix", async () => {
  const repoRoot = join(import.meta.dir, "..", "..", "..");
  const workflow = await readFile(
    join(repoRoot, ".github", "workflows", "directory-sync-import-soak.yml"),
    "utf8",
  );

  expect(workflow).toContain("git_broker_acceptance:");
  expect(workflow).toContain("bun-version: 1.3.14");
  expect(workflow).toContain("bun --version");
  expect(workflow).toContain("bun run test:git-broker-recovery");
  expect(workflow).toContain("bun run test:git-broker-process-inventory");
  expect(workflow).toContain("RUN_GIT_ZOMBIE_SOAK: 1");
  expect(workflow).toContain("GIT_ZOMBIE_SOAK_CYCLES: 100");
  expect(workflow).toContain("passes=3");
  expect(workflow).toContain("bun scripts/lint.mjs");
  expect(workflow).toContain("turbo run typecheck");
  expect(workflow).toContain("turbo run test");
  expect(workflow).toContain("turbo run build");
  expect(workflow).toContain("bun pm pack");
  expect(workflow).toContain("git-broker-affected-runtime.log");
  expect(workflow).not.toContain("retry");
});
