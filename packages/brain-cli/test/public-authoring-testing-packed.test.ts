import { describe, expect, it as bunIt } from "bun:test";
import { cp, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  buildAndPackFixturePackage,
  combinedOutput,
  packedCompatibilityEvidenceEnabled,
  packPackages,
  runCommand,
} from "./helpers/packed-consumer";

const packageDirectory = join(import.meta.dir, "..");
const remindersFixture = join(
  import.meta.dir,
  "fixtures",
  "public-authoring",
  "reminders",
);

const it = bunIt.skipIf(!packedCompatibilityEvidenceEnabled());

describe("public authoring testing entry packed", () => {
  it("runs the reminders package's own test on the packed testing entry", async () => {
    const temporaryDirectory = await mkdtemp(
      join(tmpdir(), "public-authoring-testing-"),
    );
    try {
      const tarballDirectory = join(temporaryDirectory, "tarballs");
      const tarballs = await packPackages([packageDirectory], tarballDirectory);
      const stagingDirectory = join(temporaryDirectory, "build");
      // The package is built as its author builds it, with the packed Brain
      // installed as its development dependency.
      await buildAndPackFixturePackage(
        remindersFixture,
        stagingDirectory,
        tarballDirectory,
        tarballs,
      );
      const remindersDirectory = join(stagingDirectory, "@fixture__reminders");
      await cp(
        join(remindersDirectory, "test/reminders.exercise.ts"),
        join(remindersDirectory, "test/reminders.test.ts"),
      );

      // The test and its canary typecheck against the packed declarations.
      await runCommand(
        ["bun", "x", "tsc", "-p", "tsconfig.test.json"],
        remindersDirectory,
        { timeoutMs: 120_000 },
      );
      const tested = combinedOutput(
        await runCommand(
          ["bun", "test", "./test/reminders.test.ts"],
          remindersDirectory,
          { timeoutMs: 120_000 },
        ),
      );
      expect(tested).toContain(" 4 pass");
      expect(tested).toContain(" 0 fail");
    } finally {
      await rm(temporaryDirectory, { recursive: true, force: true });
    }
  }, 300_000);
});
