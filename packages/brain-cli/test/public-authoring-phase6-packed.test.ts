import { describe, expect, it as bunIt } from "bun:test";
import { writeAuthoringTestConsumer } from "./helpers/authoring-test-consumer";
import { copyFile, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  buildAndPackFixturePackage,
  combinedOutput,
  installPackedConsumer,
  packedCompatibilityEvidenceEnabled,
  packPackages,
  runCommand,
} from "./helpers/packed-consumer";

const packageDirectory = join(import.meta.dir, "..");
const publicFixtureRoot = join(import.meta.dir, "fixtures", "public-authoring");
const entityFixture = join(publicFixtureRoot, "entity");
const serviceFixture = join(publicFixtureRoot, "service");
const accountInterfaceFixture = join(
  publicFixtureRoot,
  "account-settings-interface",
);
const operatorFixture = join(publicFixtureRoot, "operator-surface");
const consumerFixture = join(
  import.meta.dir,
  "fixtures",
  "public-authoring-operator-consumer",
);

const it = bunIt.skipIf(!packedCompatibilityEvidenceEnabled());

describe("public authoring Phase 6 packed operator contracts", () => {
  it("installs operator packages and runs four reminders harness tests", async () => {
    const root = await mkdtemp(join(tmpdir(), "operator-packed-"));
    const packageTarballs = join(root, "packages");
    const fixtureStaging = join(root, "fixtures");
    const fixtureTarballs = join(root, "fixture-tarballs");
    const consumerDirectory = join(root, "consumer");

    try {
      const tarballs = new Map(
        await packPackages([packageDirectory], packageTarballs),
      );
      tarballs.set(
        ...(await buildAndPackFixturePackage(
          entityFixture,
          fixtureStaging,
          fixtureTarballs,
          tarballs,
        )),
      );
      tarballs.set(
        ...(await buildAndPackFixturePackage(
          serviceFixture,
          fixtureStaging,
          fixtureTarballs,
          tarballs,
        )),
      );
      tarballs.set(
        ...(await buildAndPackFixturePackage(
          accountInterfaceFixture,
          fixtureStaging,
          fixtureTarballs,
          tarballs,
        )),
      );
      tarballs.set(
        ...(await buildAndPackFixturePackage(
          operatorFixture,
          fixtureStaging,
          fixtureTarballs,
          tarballs,
        )),
      );

      const remindersFixture = join(publicFixtureRoot, "reminders");
      tarballs.set(
        ...(await buildAndPackFixturePackage(
          remindersFixture,
          fixtureStaging,
          fixtureTarballs,
          tarballs,
        )),
      );
      await installPackedConsumer(consumerFixture, consumerDirectory, tarballs);
      await copyFile(
        join(remindersFixture, "test/consumer.ts"),
        join(consumerDirectory, "reminders.test.ts"),
      );
      await runCommand(["bun", "run", "typecheck"], consumerDirectory, {
        timeoutMs: 120_000,
      });
      const smoke = combinedOutput(
        await runCommand(["bun", "run", "smoke"], consumerDirectory),
      );

      await writeAuthoringTestConsumer(consumerDirectory);
      await runCommand(
        ["bun", "x", "tsc", "-p", "tsconfig.authoring.json"],
        consumerDirectory,
      );
      const authorTests = await runCommand(
        ["bun", "test", "authoring.test.ts"],
        consumerDirectory,
      );
      expect(combinedOutput(authorTests)).toContain("0 fail");
      await writeFile(
        join(consumerDirectory, "tsconfig.reminders.json"),
        JSON.stringify({
          extends: "./tsconfig.authoring.json",
          compilerOptions: {
            noEmit: false,
            declaration: true,
            emitDeclarationOnly: true,
            outDir: "reminders-types",
          },
          include: ["reminders.test.ts"],
        }),
      );
      await runCommand(
        ["bun", "x", "tsc", "-p", "tsconfig.reminders.json"],
        consumerDirectory,
      );
      const reminderTests = await runCommand(
        ["bun", "test", "reminders.test.ts"],
        consumerDirectory,
      );
      expect(combinedOutput(reminderTests)).toContain("4 pass");
      expect(combinedOutput(reminderTests)).toContain("0 fail");
      expect(smoke).not.toContain("did not compose");
      expect(tarballs.size).toBe(6);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  }, 300_000);
});
