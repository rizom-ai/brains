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
  startCommand,
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
      expect(
        existsSync(
          join(consumerDirectory, "node_modules", "@libsql", "client"),
        ),
      ).toBe(false);
      await runCommand(["bun", "run", "import-smoke.ts"], consumerDirectory);
      const backupBundle = await runCommand(
        [
          "bun",
          "-e",
          `
        import { cp, mkdir, writeFile } from "node:fs/promises";
        import { parseBackupRuntimeEnvironment } from "@rizom/brain/deploy";
        if (parseBackupRuntimeEnvironment(["CHECK=value"])[0] !== "CHECK=value") throw new Error("Missing public backup validation");
        await mkdir("backup-scripts");
        for (const file of ["create-predeploy-backup.ts", "turso-backup.ts"]) {
          await cp("node_modules/@rizom/brain/templates/deploy/scripts/" + file, "backup-scripts/" + file);
        }
        await writeFile("backup-scripts/helpers.ts", 'export { parseTursoBackupManifest, parseBackupRuntimeEnvironment } from "@rizom/brain/deploy";');
        const built = await Bun.build({ entrypoints: ["backup-scripts/create-predeploy-backup.ts"], target: "bun", external: ["@tursodatabase/database"] });
        if (!built.success || !built.outputs[0]) throw new Error("Backup capture bundle failed outside the monorepo");
        await Bun.write("backup-scripts/restore.js", built.outputs[0]);
        console.log("backup bundle verified");
      `,
        ],
        consumerDirectory,
      );
      expect(combinedOutput(backupBundle)).toContain("backup bundle verified");
      const runtimeEnv = { ...process.env };
      delete runtimeEnv["BRAINS_DB_ENGINE"];
      runtimeEnv["AI_API_KEY"] = "packed-startup-check";
      runtimeEnv["GIT_SYNC_TOKEN"] = "packed-startup-check";
      const startup = await runCommand(
        ["bun", "run", "brain", "start", "--startup-check"],
        consumerDirectory,
        {
          env: runtimeEnv,
          timeoutMs: 90_000,
        },
      );
      expect(combinedOutput(startup)).toContain("Dashboard plugin registered");

      const fencedWorker = await startCommand(
        ["bun", "run", "brain", "start", "--startup-check"],
        consumerDirectory,
        {
          env: {
            ...runtimeEnv,
            BRAINS_FORBID_LOCAL_DATABASE_OPEN: "1",
          },
        },
      ).completed;
      expect(fencedWorker.exitCode).not.toBe(0);
      expect(combinedOutput(fencedWorker)).toContain(
        "Local SQLite opens are forbidden in this process",
      );

      const retiredSelector = await runCommand(
        ["bun", "run", "brain", "start", "--startup-check"],
        consumerDirectory,
        {
          env: { ...runtimeEnv, BRAINS_DB_ENGINE: "libsql" },
          timeoutMs: 90_000,
        },
      );
      expect(combinedOutput(retiredSelector)).toContain(
        "Dashboard plugin registered",
      );
    } finally {
      await rm(temporaryDirectory, { recursive: true, force: true });
    }
  }, 180_000);
});
