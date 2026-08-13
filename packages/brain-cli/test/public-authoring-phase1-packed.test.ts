import { describe, expect, it as bunIt } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
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
const entityFixture = join(
  import.meta.dir,
  "fixtures",
  "public-authoring",
  "entity",
);
const brainFixture = join(import.meta.dir, "fixtures", "brain-definition");
const consumerFixture = join(
  import.meta.dir,
  "fixtures",
  "public-authoring-phase1-consumer",
);
const it = bunIt.skipIf(!packedCompatibilityEvidenceEnabled());

describe("public authoring Phase 1 packed canary", () => {
  it("builds, packs, installs, imports, and boots declarative definitions", async () => {
    const temporaryDirectory = await mkdtemp(
      join(tmpdir(), "public-authoring-phase1-"),
    );
    try {
      const tarballDirectory = join(temporaryDirectory, "tarballs");
      const tarballs = new Map(
        await packPackages([packageDirectory], tarballDirectory),
      );
      const entity = await buildAndPackFixturePackage(
        entityFixture,
        join(temporaryDirectory, "build"),
        tarballDirectory,
        tarballs,
      );
      tarballs.set(...entity);
      const brain = await buildAndPackFixturePackage(
        brainFixture,
        join(temporaryDirectory, "build"),
        tarballDirectory,
        tarballs,
      );
      tarballs.set(...brain);

      const consumerDirectory = join(temporaryDirectory, "consumer");
      await installPackedConsumer(consumerFixture, consumerDirectory, tarballs);
      await runCommand(["bun", "run", "import-smoke.ts"], consumerDirectory);
      const startup = await runCommand(
        ["bun", "run", "brain", "start", "--startup-check"],
        consumerDirectory,
        {
          env: {
            ...process.env,
            AI_API_KEY: "packed-startup-check",
          },
          timeoutMs: 90_000,
        },
      );

      expect(combinedOutput(startup)).toContain(
        "Default brain-character created successfully",
      );

      const listed = await runCommand(
        ["bun", "run", "brain", "list", "bookmark"],
        consumerDirectory,
        {
          env: {
            ...process.env,
            AI_API_KEY: "packed-startup-check",
          },
          timeoutMs: 90_000,
        },
      );
      expect(combinedOutput(listed)).toContain("[]");
    } finally {
      await rm(temporaryDirectory, { recursive: true, force: true });
    }
  }, 180_000);
});
