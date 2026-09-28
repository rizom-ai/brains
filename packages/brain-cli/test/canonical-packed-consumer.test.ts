import { describe, expect, test } from "bun:test";
import { fileActorSources } from "@brains/app";
import { existsSync } from "node:fs";
import { copyFile, mkdir, mkdtemp, rm } from "node:fs/promises";
import { verifyInstalledFileRuntime } from "./helpers/installed-file-runtime";
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
  test("installs, imports, starts native file actors and restarts outside the monorepo", async () => {
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
      await mkdir(join(consumerDirectory, "acceptance-content", "image"), {
        recursive: true,
      });
      await copyFile(
        join(
          packageDirectory,
          "eval-content/recipes/personal/image/hero-banner.png",
        ),
        join(consumerDirectory, "packed-image.png"),
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
      const installedDist = join(
        consumerDirectory,
        "node_modules",
        "@rizom",
        "brain",
        "dist",
      );
      const entryHashes: string[] = [];
      for (const directory of [join(packageDirectory, "dist"), installedDist]) {
        entryHashes.push(
          new Bun.CryptoHasher("sha256")
            .update(await Bun.file(join(directory, "brain.js")).bytes())
            .digest("hex"),
        );
      }
      expect(entryHashes[1]).toBe(entryHashes[0]);
      for (const owner of [installedDist, join(installedDist, "chunks")]) {
        for (const worker of [
          "worker",
          "network-ingress-worker",
          "network-read-worker",
        ]) {
          expect(existsSync(join(owner, "turso-worker", `${worker}.ts`))).toBe(
            true,
          );
        }
      }
      for (const actor of Object.keys(fileActorSources)) {
        expect(
          existsSync(join(installedDist, "file-actors", `${actor}.js`)),
        ).toBe(true);
      }
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
      expect(combinedOutput(startup)).not.toMatch(
        /Error initializing plugin|Failed to initialize plugin|Persistence owner lost/,
      );

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
      await verifyInstalledFileRuntime(consumerDirectory, {
        ...runtimeEnv,
        HTTP_PROXY: "http://127.0.0.1:9",
        HTTPS_PROXY: "http://127.0.0.1:9",
        NO_PROXY: "localhost,127.0.0.1",
      });
    } finally {
      await rm(temporaryDirectory, { recursive: true, force: true });
    }
  }, 180_000);
});
