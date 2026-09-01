import { afterEach, describe, expect, it } from "bun:test";
import { Database } from "bun:sqlite";
import { Buffer } from "node:buffer";
import {
  chmod,
  lstat,
  mkdtemp,
  readFile,
  readlink,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  capturePredeployBackup,
  parsePredeployBackupOutput,
  renderPredeployBackupRemoteScript,
  type PredeployCaptureConfig,
} from "../src/deploy-scripts/create-predeploy-backup";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((path) => rm(path, { recursive: true, force: true })),
  );
});

function git(cwd: string, args: string[]): string {
  const result = Bun.spawnSync(["git", ...args], { cwd, stderr: "pipe" });
  if (result.exitCode !== 0) {
    throw new Error(`git ${args[0]} failed`);
  }
  return result.stdout.toString().trim();
}

describe("predeploy backup output", () => {
  it("accepts only a complete verified result", () => {
    expect(
      parsePredeployBackupOutput(`SNAPSHOT_ID=predeploy-smoke-v1-20260901T000000Z
BACKUP=/opt/brain-state/backups/predeploy-smoke-v1-20260901T000000Z
SOURCE_VERSION=0.2.0-alpha.342
TARGET_VERSION=v1
TOTAL_BYTES=123
DURATION_SECONDS=4
VERIFICATION=passed
`),
    ).toEqual({
      applicable: true,
      snapshotId: "predeploy-smoke-v1-20260901T000000Z",
      backupPath:
        "/opt/brain-state/backups/predeploy-smoke-v1-20260901T000000Z",
      sourceVersion: "0.2.0-alpha.342",
      targetVersion: "v1",
      totalBytes: 123,
      durationSeconds: 4,
      verification: "passed",
    });
    expect(
      parsePredeployBackupOutput(
        "pre-deploy snapshot: not applicable (new server)\n",
      ),
    ).toEqual({ applicable: false });
    expect(() =>
      parsePredeployBackupOutput("SNAPSHOT_ID=incomplete\n"),
    ).toThrow("Incomplete predeploy backup result");
  });

  it("renders a secret-safe fail-closed remote program", () => {
    const script = renderPredeployBackupRemoteScript();

    expect(script).toContain("set -euo pipefail");
    expect(script).toContain(
      "persistent state exists without an identifiable runtime",
    );
    expect(script).toContain("sha256sum --check");
    expect(script).toContain('mv "$incomplete" "$final"');
    expect(script).toContain("DEFAULT_RETENTION_COUNT");
    expect(script).toContain('case "$candidate" in *.incomplete)');
    expect(script).toContain('[ "$candidate" != "$preserve" ]');
    expect(script).toContain(
      'prune_verified "$DEFAULT_RETENTION_COUNT" "$final"',
    );
    expect(script).not.toContain("skip_predeploy_backup");
    expect(script).not.toContain(".Config.Env");
    expect(script).not.toMatch(/cp\s+[^\n]*\.db/);
    const syntax = Bun.spawnSync(["bash", "-n"], {
      stdin: Buffer.from(script),
      stdout: "pipe",
      stderr: "pipe",
    });
    expect(syntax.exitCode).toBe(0);
  });
});

describe("predeploy backup capture program", () => {
  it("does not finalize after a required database failure", async () => {
    const root = await mkdtemp(join(tmpdir(), "predeploy-backup-missing-"));
    temporaryDirectories.push(root);
    const backupDir = join(root, "backup");
    await Bun.$`mkdir -p ${backupDir}`.quiet();

    let failure: unknown;
    try {
      await capturePredeployBackup({
        backupDir,
        contentRoot: join(root, "missing-content"),
        databases: [
          {
            source: join(root, "missing.db"),
            name: "missing.db",
            method: "vacuum",
            quickCheck: "bun",
            logicalVector: false,
          },
        ],
        metadata: {
          snapshotId: "predeploy-test-missing",
          targetHandle: "test",
          host: "test-host",
          startedAt: new Date().toISOString(),
          sourceVersion: "source",
          targetVersion: "target",
          toolVersion: "test",
          containerId: "container",
          imageId: "image",
          imageDigest: "digest",
        },
      });
    } catch (error) {
      failure = error;
    }
    expect(failure).toBeInstanceOf(Error);
    expect(String(failure)).toContain("Required database missing");
    expect(await Bun.file(join(backupDir, "manifest.json")).exists()).toBe(
      false,
    );
  });

  it("snapshots WAL writes and round-trips exact dirty Git state without mutation", async () => {
    const root = await mkdtemp(join(tmpdir(), "predeploy-backup-"));
    temporaryDirectories.push(root);
    const sourceDatabase = join(root, "source.db");
    const backupDir = join(root, "backup");
    const contentDir = join(root, "content");
    const remoteDir = join(root, "remote.git");
    const restoredDir = join(root, "restored");
    const writerPath = join(root, "writer.ts");
    const readyPath = join(root, "writer-ready");

    await Bun.write(join(root, "placeholder"), "");
    await Bun.$`mkdir -p ${backupDir} ${contentDir}`.quiet();

    const database = new Database(sourceDatabase, { create: true });
    database.run("PRAGMA journal_mode=WAL");
    database.run("CREATE TABLE entries(id INTEGER PRIMARY KEY, value TEXT)");
    for (let index = 0; index < 20; index += 1) {
      database.run("INSERT INTO entries(value) VALUES (?)", [
        `initial-${index}`,
      ]);
    }
    database.close(false);

    git(contentDir, ["init", "-b", "main"]);
    git(contentDir, ["config", "user.name", "Backup Test"]);
    git(contentDir, ["config", "user.email", "backup@example.com"]);
    await writeFile(join(contentDir, ".gitignore"), "ignored.bin\n");
    await writeFile(join(contentDir, "tracked.txt"), "base\n");
    git(contentDir, ["add", ".gitignore", "tracked.txt"]);
    git(contentDir, ["commit", "-m", "base"]);
    git(root, ["init", "--bare", remoteDir]);
    git(contentDir, ["remote", "add", "origin", remoteDir]);
    git(contentDir, ["push", "--set-upstream", "origin", "main"]);

    await writeFile(join(contentDir, "tracked.txt"), "staged\n");
    git(contentDir, ["add", "tracked.txt"]);
    await writeFile(join(contentDir, "tracked.txt"), "unstaged\n");
    await writeFile(
      join(contentDir, "untracked.bin"),
      new Uint8Array([0, 1, 2, 3, 255]),
    );
    await writeFile(join(contentDir, "ignored.bin"), new Uint8Array([9, 8, 7]));
    await writeFile(join(contentDir, "executable.sh"), "#!/bin/sh\nexit 0\n");
    await chmod(join(contentDir, "executable.sh"), 0o755);
    await Bun.$`ln -s tracked.txt ${join(contentDir, "tracked-link")}`.quiet();

    const originalHead = git(contentDir, ["rev-parse", "HEAD"]);
    const originalStatus = git(contentDir, [
      "status",
      "--porcelain=v1",
      "--untracked-files=all",
    ]);

    await writeFile(
      writerPath,
      `import { Database } from "bun:sqlite";
const [sourcePath, readyPath] = process.argv.slice(2);
const db = new Database(sourcePath);
await Bun.write(readyPath, "ready");
for (let index = 0; index < 80; index += 1) {
  db.run("INSERT INTO entries(value) VALUES (?)", [\`concurrent-\${index}\`]);
  await Bun.sleep(5);
}
db.close(false);
`,
    );
    const writer = Bun.spawn(
      [process.execPath, writerPath, sourceDatabase, readyPath],
      { stdout: "ignore", stderr: "pipe" },
    );
    for (let attempt = 0; attempt < 100; attempt += 1) {
      if (await Bun.file(readyPath).exists()) break;
      await Bun.sleep(5);
    }
    expect(await Bun.file(readyPath).exists()).toBe(true);

    const config: PredeployCaptureConfig = {
      backupDir,
      contentRoot: contentDir,
      databases: [
        {
          source: sourceDatabase,
          name: "source.db",
          method: "vacuum",
          quickCheck: "bun",
          logicalVector: false,
        },
      ],
      metadata: {
        snapshotId: "predeploy-test-v1-20260901T000000Z",
        targetHandle: "test",
        host: "test-host",
        startedAt: new Date().toISOString(),
        sourceVersion: "source",
        targetVersion: "target",
        toolVersion: "test",
        containerId: "container",
        imageId: "image",
        imageDigest: "digest",
      },
    };
    await capturePredeployBackup(config);

    const snapshot = new Database(join(backupDir, "source.db"), {
      readonly: true,
    });
    expect(snapshot.query("PRAGMA quick_check").get()).toEqual({
      quick_check: "ok",
    });
    const capturedCount = Number(
      (
        snapshot.query("SELECT COUNT(*) AS count FROM entries").get() as {
          count: number;
        } | null
      )?.count,
    );
    snapshot.close(false);
    expect(capturedCount).toBeGreaterThanOrEqual(20);
    expect(capturedCount).toBeLessThanOrEqual(100);

    const writerExit = await writer.exited;
    if (writerExit !== 0) {
      throw new Error(await new Response(writer.stderr).text());
    }

    expect(git(contentDir, ["rev-parse", "HEAD"])).toBe(originalHead);
    expect(
      git(contentDir, ["status", "--porcelain=v1", "--untracked-files=all"]),
    ).toBe(originalStatus);

    const manifest = (await Bun.file(
      join(backupDir, "manifest.json"),
    ).json()) as {
      outcome: string;
      databases: Array<{ quickCheck: string; status: string }>;
      git: {
        stagedPatchBytes: number;
        unstagedPatchBytes: number;
        untrackedFiles: number;
        ignoredFiles: number;
        bundleVerified: boolean;
      };
    };
    expect(manifest.outcome).toBe("verified");
    expect(manifest.databases).toEqual([
      expect.objectContaining({ status: "captured", quickCheck: "ok" }),
    ]);
    expect(manifest.git).toEqual(
      expect.objectContaining({
        stagedPatchBytes: expect.any(Number),
        unstagedPatchBytes: expect.any(Number),
        untrackedFiles: 3,
        ignoredFiles: 1,
        bundleVerified: true,
      }),
    );
    expect(JSON.stringify(manifest)).not.toContain("process.env");

    git(root, ["clone", join(backupDir, "content.bundle"), restoredDir]);
    git(restoredDir, [
      "apply",
      "--binary",
      "--index",
      join(backupDir, "content-staged.patch"),
    ]);
    git(restoredDir, [
      "apply",
      "--binary",
      join(backupDir, "content-unstaged.patch"),
    ]);
    Bun.spawnSync([
      "tar",
      "-C",
      restoredDir,
      "-xf",
      join(backupDir, "content-untracked.tar"),
    ]);
    Bun.spawnSync([
      "tar",
      "-C",
      restoredDir,
      "-xf",
      join(backupDir, "content-ignored.tar"),
    ]);

    expect(
      git(restoredDir, ["status", "--porcelain=v1", "--untracked-files=all"]),
    ).toBe(originalStatus);
    expect(
      git(restoredDir, [
        "ls-files",
        "--others",
        "--ignored",
        "--exclude-standard",
      ]),
    ).toBe("ignored.bin");
    expect(
      new Uint8Array(await readFile(join(restoredDir, "untracked.bin"))),
    ).toEqual(new Uint8Array([0, 1, 2, 3, 255]));
    expect(
      new Uint8Array(await readFile(join(restoredDir, "ignored.bin"))),
    ).toEqual(new Uint8Array([9, 8, 7]));
    expect(
      (await lstat(join(restoredDir, "executable.sh"))).mode & 0o111,
    ).toBeGreaterThan(0);
    expect(await readlink(join(restoredDir, "tracked-link"))).toBe(
      "tracked.txt",
    );
  }, 20_000);
});
