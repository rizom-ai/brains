import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  combinedOutput,
  installPackedConsumer,
  packPackages,
  runCommand,
} from "./helpers/packed-consumer";

const packageDirectory = join(import.meta.dir, "..");
const fixtureDirectory = join(
  import.meta.dir,
  "fixtures",
  "canonical-packed-consumer",
);

describe("canonical packed consumer", () => {
  test("installs, imports, and completes a startup check outside the monorepo", async () => {
    const temporaryDirectory = await mkdtemp(
      join(tmpdir(), "canonical-brain-pack-"),
    );
    try {
      const tarballs = await packPackages(
        [packageDirectory],
        join(temporaryDirectory, "tarballs"),
      );
      const consumerDirectory = join(temporaryDirectory, "consumer");
      await installPackedConsumer(
        fixtureDirectory,
        consumerDirectory,
        tarballs,
      );
      await mkdir(join(consumerDirectory, "seed-content"));
      await writeFile(
        join(consumerDirectory, "seed-content", "README.md"),
        "# Packed consumer\n",
      );

      expect(
        existsSync(
          join(
            consumerDirectory,
            "node_modules",
            "@rizom",
            "brain",
            "dist",
            "rollback-entities-to-libsql.js",
          ),
        ),
      ).toBe(false);
      await runCommand(["bun", "run", "import-smoke.ts"], consumerDirectory);
      const runtimeEnv = {
        ...process.env,
        AI_API_KEY: "packed-startup-check",
        GIT_SYNC_TOKEN: "packed-startup-check",
      };
      const startup = await runCommand(
        ["bun", "run", "brain", "start", "--startup-check"],
        consumerDirectory,
        {
          env: { ...runtimeEnv, BRAINS_DB_ENGINE: "turso" },
          timeoutMs: 90_000,
        },
      );
      expect(combinedOutput(startup)).toContain("Dashboard plugin registered");

      const fencedWorker = await runCommand(
        ["bun", "run", "brain", "start", "--startup-check"],
        consumerDirectory,
        {
          env: {
            ...runtimeEnv,
            BRAINS_DB_ENGINE: "turso",
            BRAINS_FORBID_LOCAL_DATABASE_OPEN: "1",
          },
          timeoutMs: 90_000,
        },
      );
      expect(fencedWorker.exitCode).not.toBe(0);
      expect(combinedOutput(fencedWorker)).toContain(
        "Local SQLite opens are forbidden in this process",
      );

      const fallback = await runCommand(
        ["bun", "run", "brain", "start", "--startup-check"],
        consumerDirectory,
        {
          env: { ...runtimeEnv, BRAINS_DB_ENGINE: "libsql" },
          timeoutMs: 90_000,
        },
      );
      expect(combinedOutput(fallback)).toContain("Dashboard plugin registered");
    } finally {
      await rm(temporaryDirectory, { recursive: true, force: true });
    }
  }, 180_000);
});
