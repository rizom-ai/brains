import { afterEach, describe, expect, it } from "bun:test";
import { connect } from "@tursodatabase/database";
import {
  chmod,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readlink,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  capturePredeployBackup,
  parsePredeployBackupOutput,
  renderPredeployBackupRemoteScript,
  restorePredeployBackup,
  type PredeployCaptureConfig,
} from "../src/deploy-scripts/create-predeploy-backup";
import {
  fileSha256,
  TURSO_BACKUP_DATABASE_NAMES,
} from "../src/deploy-scripts/turso-backup";

const roots: string[] = [];
afterEach(async () => {
  for (const root of roots.splice(0))
    await rm(root, { recursive: true, force: true });
});
function git(cwd: string, args: string[]): string {
  const result = Bun.spawnSync(["git", ...args], { cwd, stderr: "pipe" });
  if (result.exitCode !== 0) throw new Error(`git ${args[0]} failed`);
  return result.stdout.toString().trim();
}
async function failure(operation: Promise<unknown>): Promise<unknown> {
  return operation.then(
    () => undefined,
    (error: unknown) => error,
  );
}

async function fixture(): Promise<{
  root: string;
  config: PredeployCaptureConfig;
  key: Uint8Array;
}> {
  const root = await mkdtemp(join(tmpdir(), "turso backup "));
  roots.push(root);
  const source = join(root, "source"),
    backupDir = join(root, "backup"),
    contentRoot = join(root, "content"),
    runtimeConfig = join(root, "config");
  for (const path of [source, backupDir, contentRoot, runtimeConfig])
    await mkdir(path);
  const key = crypto.getRandomValues(new Uint8Array(32));
  const encryptionKey = await crypto.subtle.importKey(
    "raw",
    key,
    "AES-GCM",
    false,
    ["encrypt"],
  );
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: "AES-GCM", iv: new Uint8Array(12) },
      encryptionKey,
      new TextEncoder().encode("saved account setting"),
    ),
  );
  const databases = [];
  for (const name of TURSO_BACKUP_DATABASE_NAMES) {
    const path = join(source, name);
    const db = await connect(path);
    try {
      await db.exec(
        "CREATE TABLE entries(id INTEGER PRIMARY KEY, value TEXT, payload BLOB)",
      );
      const statement = await db.prepare(
        "INSERT INTO entries VALUES (1, ?, ?)",
      );
      try {
        await statement.run(name, ciphertext);
      } finally {
        statement.close();
      }
      if (name === "brain-jobs.db")
        await db.exec(
          "CREATE TABLE job_queue(id TEXT PRIMARY KEY, status TEXT); INSERT INTO job_queue VALUES ('queued', 'pending')",
        );
      if (name === "brain.db")
        await db.exec(
          "CREATE TABLE embeddings(entity_id TEXT PRIMARY KEY, embedding BLOB); INSERT INTO embeddings VALUES ('entity', X'000102FF')",
        );
      if (name === "auth.db")
        await db.exec(
          "CREATE TABLE passkeys(id TEXT PRIMARY KEY, counter INTEGER); INSERT INTO passkeys VALUES ('credential', 7)",
        );
    } finally {
      await db.close();
    }
    // Native close leaves committed Turso WAL frames. Capture must recover those,
    // rather than silently copying a main file through another SQLite engine.
    expect((await lstat(`${path}-wal`)).size).toBeGreaterThan(0);
    databases.push({ name, source: path });
  }
  git(contentRoot, ["init", "-b", "main"]);
  git(contentRoot, ["config", "user.name", "Backup Test"]);
  git(contentRoot, ["config", "user.email", "backup@example.com"]);
  await writeFile(join(contentRoot, ".gitignore"), "ignored.bin\n");
  await writeFile(join(contentRoot, "tracked.txt"), "base\n");
  git(contentRoot, ["add", "."]);
  git(contentRoot, ["commit", "-m", "base"]);
  const remote = join(root, "remote.git");
  git(root, ["init", "--bare", remote]);
  git(contentRoot, ["remote", "add", "origin", remote]);
  git(contentRoot, ["push", "--set-upstream", "origin", "main"]);
  git(contentRoot, ["branch", "local-only"]);
  await writeFile(join(contentRoot, "stash-note.txt"), "keep this stash");
  git(contentRoot, ["add", "stash-note.txt"]);
  git(contentRoot, ["stash", "push", "-m", "saved work"]);
  await writeFile(join(contentRoot, "tracked.txt"), "staged\n");
  git(contentRoot, ["add", "tracked.txt"]);
  await writeFile(join(contentRoot, "tracked.txt"), "unstaged\n");
  await writeFile(
    join(contentRoot, "untracked.bin"),
    new Uint8Array([0, 1, 255]),
  );
  await writeFile(join(contentRoot, "ignored.bin"), new Uint8Array([9, 8, 7]));
  await writeFile(join(contentRoot, "executable.sh"), "#!/bin/sh\nexit 0\n");
  await chmod(join(contentRoot, "executable.sh"), 0o755);
  await symlink("tracked.txt", join(contentRoot, "tracked-link"));
  const brainYaml = join(root, "brain.yaml"),
    environmentFile = join(root, "environment.json");
  await writeFile(brainYaml, "name: backup-test\n");
  await writeFile(join(runtimeConfig, "settings.json"), '{"preserve":true}');
  await writeFile(
    environmentFile,
    JSON.stringify([
      `ACCOUNT_SETTINGS_ENCRYPTION_KEY=${Buffer.from(key).toString("base64")}`,
      "NODE_ENV=production",
    ]),
  );
  return {
    root,
    key,
    config: {
      backupDir,
      contentRoot,
      databases,
      sourceStopped: true,
      configuration: { brainYaml, runtimeConfig, environmentFile },
      metadata: {
        snapshotId: "predeploy-test",
        targetHandle: "test",
        host: "test-host",
        startedAt: new Date().toISOString(),
        sourceVersion: "0.3.0-alpha.1",
        targetVersion: "target",
        toolVersion: "test",
        containerId: "container",
        imageId: "image",
        imageDigest: "digest",
      },
    },
  };
}

async function hashes(config: PredeployCaptureConfig): Promise<string[]> {
  return Promise.all(
    config.databases.flatMap((database) => [
      fileSha256(database.source),
      fileSha256(`${database.source}-wal`),
    ]),
  );
}

describe("predeploy backup", () => {
  it("requires complete verified command output", () => {
    expect(
      parsePredeployBackupOutput(
        "SNAPSHOT_ID=snapshot\nBACKUP=/backup\nSOURCE_VERSION=0.3.0\nTARGET_VERSION=target\nTOTAL_BYTES=123\nDURATION_SECONDS=4\nVERIFICATION=passed\n",
      ),
    ).toMatchObject({
      applicable: true,
      totalBytes: 123,
      verification: "passed",
    });
    expect(
      parsePredeployBackupOutput(
        "pre-deploy snapshot: not applicable (new server)\n",
      ),
    ).toEqual({ applicable: false });
    expect(() => parsePredeployBackupOutput("SNAPSHOT_ID=incomplete")).toThrow(
      "Incomplete predeploy backup result",
    );
  });

  it("renders a cold, same-engine capture with restart cleanup and event-driven readiness", () => {
    const script = renderPredeployBackupRemoteScript();
    expect(script).toContain("set -euo pipefail");
    expect(script).toContain(
      "persistent state exists without an identifiable runtime",
    );
    expect(script).toContain("flock 9");
    expect(script).toContain("docker stop -t -1");
    expect(script).toContain('--volumes-from "$container:ro"');
    expect(script).toContain("--network none");
    expect(script).toContain(
      "--no-healthcheck --label ai.rizom.brain.watchdog=false",
    );
    expect(script).toContain("trap cleanup EXIT");
    expect(script).toContain("docker events --since");
    expect(script).toContain('kill "$event_pid"');
    expect(script).toContain("sha256sum --check");
    expect(script).toContain('mv "$incomplete" "$final"');
    expect(script).toContain('case "$candidate" in *.incomplete)');
    expect(script).toContain('[ "$candidate" != "$preserve" ]');
    expect(script).toContain(
      'prune_verified "$DEFAULT_RETENTION_COUNT" "$final"',
    );
    expect(script).toContain(
      "'{{json .Config.Env}}' > \"$incomplete/runtime-environment.json\"",
    );
    expect(script).not.toContain("embeddings.db");
    expect(script).not.toContain("sleep ");
    expect(script).not.toContain("skip_predeploy_backup");
    expect(
      Bun.spawnSync(["bash", "-n"], {
        stdin: Buffer.from(script),
        stderr: "pipe",
      }).exitCode,
    ).toBe(0);
  });

  it("recovers all five Turso WALs and restores dirty Git, configuration and encrypted auth data without source mutation", async () => {
    const { root, config, key } = await fixture();
    const originalHashes = await hashes(config);
    const status = git(config.contentRoot, [
      "status",
      "--porcelain=v1",
      "--untracked-files=all",
    ]);
    await capturePredeployBackup(config);
    expect(await hashes(config)).toEqual(originalHashes);
    expect(
      git(config.contentRoot, [
        "status",
        "--porcelain=v1",
        "--untracked-files=all",
      ]),
    ).toBe(status);
    const destination = join(root, "restored");
    expect(
      await restorePredeployBackup({
        backupDir: config.backupDir,
        destination,
      }),
    ).toBe(destination);
    const manifest = await Bun.file(
      join(config.backupDir, "manifest.json"),
    ).json();
    expect(manifest).toMatchObject({
      schemaVersion: 2,
      engine: "turso",
      outcome: "verified",
      restoreVerified: true,
    });
    expect(JSON.stringify(manifest)).not.toContain(
      Buffer.from(key).toString("base64"),
    );
    expect(
      (await lstat(join(config.backupDir, "runtime-environment.json"))).mode &
        0o777,
    ).toBe(0o600);
    expect((await lstat(destination)).mode & 0o777).toBe(0o700);
    for (const name of TURSO_BACKUP_DATABASE_NAMES) {
      const path = join(
        destination,
        "data",
        name === "auth.db" ? "auth/auth.db" : name,
      );
      expect(await fileSha256(path)).toBe(
        await fileSha256(join(config.backupDir, name)),
      );
      const db = await connect(path);
      try {
        const stmt = await db.prepare("SELECT value, payload FROM entries");
        const row = await stmt.get();
        stmt.close();
        expect(row.value).toBe(name);
        const env: string[] = await Bun.file(
          join(destination, "runtime-environment.json"),
        ).json();
        const encoded = env
          .find((line) => line.startsWith("ACCOUNT_SETTINGS_ENCRYPTION_KEY="))
          ?.split("=")
          .slice(1)
          .join("=");
        if (!encoded) throw new Error("Missing encryption key in restore");
        const restoredKey = await crypto.subtle.importKey(
          "raw",
          Buffer.from(encoded, "base64"),
          "AES-GCM",
          false,
          ["decrypt"],
        );
        expect(
          new TextDecoder().decode(
            await crypto.subtle.decrypt(
              { name: "AES-GCM", iv: new Uint8Array(12) },
              restoredKey,
              row.payload,
            ),
          ),
        ).toBe("saved account setting");
        if (name === "brain.db") {
          const embeddings = await db.prepare(
            "SELECT hex(embedding) AS value FROM embeddings",
          );
          expect((await embeddings.get()).value).toBe("000102FF");
          embeddings.close();
        }
        if (name === "auth.db") {
          const passkeys = await db.prepare("SELECT counter FROM passkeys");
          expect((await passkeys.get()).counter).toBe(7);
          passkeys.close();
        }
      } finally {
        await db.close();
      }
    }
    expect(
      git(join(destination, "content"), [
        "status",
        "--porcelain=v1",
        "--untracked-files=all",
      ]),
    ).toBe(status);
    expect(git(join(destination, "content"), ["remote"])).toBe("");
    expect(git(join(destination, "content"), ["show-ref"])).toBe(
      git(config.contentRoot, ["show-ref"]),
    );
    expect(
      git(join(destination, "content"), ["show", "refs/stash:stash-note.txt"]),
    ).toBe("keep this stash");
    expect(await readFile(join(destination, "content/untracked.bin"))).toEqual(
      Buffer.from([0, 1, 255]),
    );
    expect(await readFile(join(destination, "content/ignored.bin"))).toEqual(
      Buffer.from([9, 8, 7]),
    );
    expect(
      (await lstat(join(destination, "content/executable.sh"))).mode & 0o111,
    ).toBeGreaterThan(0);
    expect(await readlink(join(destination, "content/tracked-link"))).toBe(
      "tracked.txt",
    );
    expect(await readFile(join(destination, "brain.yaml"), "utf8")).toBe(
      "name: backup-test\n",
    );
    expect(
      await readFile(join(destination, "config/settings.json"), "utf8"),
    ).toBe('{"preserve":true}');
  });

  it("runs the bundled restore command from stdin without source-module imports", async () => {
    const { root, config } = await fixture();
    await capturePredeployBackup(config);
    const bundle = await Bun.build({
      entrypoints: [
        join(
          import.meta.dir,
          "../src/deploy-scripts/create-predeploy-backup.ts",
        ),
      ],
      target: "bun",
      external: ["@tursodatabase/database"],
    });
    const output = bundle.outputs[0];
    if (!bundle.success || !output) throw new Error("Missing restore bundle");
    const destination = join(root, "bundled-restore");
    const child = Bun.spawn([process.execPath, "run", "-", "--restore"], {
      cwd: join(import.meta.dir, ".."),
      env: {
        ...process.env,
        BACKUP_DIR: config.backupDir,
        RESTORE_DIR: destination,
      },
      stdin: "pipe",
      stdout: "pipe",
      stderr: "pipe",
    });
    await child.stdin.write(await output.text());
    await child.stdin.end();
    const [code, stdout, stderr] = await Promise.all([
      child.exited,
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
    ]);
    expect(stderr).toBe("");
    expect(code).toBe(0);
    expect(stdout).toContain(`Verified restore: ${destination}`);
    expect(await fileSha256(join(destination, "data/auth/auth.db"))).toBe(
      await fileSha256(join(config.backupDir, "auth.db")),
    );
  });

  it("rejects running-source confirmation, 0.2 inputs and missing auth before publishing", async () => {
    const { config } = await fixture();
    expect(
      await failure(
        capturePredeployBackup({ ...config, sourceStopped: false }),
      ),
    ).toBeInstanceOf(Error);
    expect(
      await failure(
        capturePredeployBackup({
          ...config,
          metadata: { ...config.metadata, sourceVersion: "0.2.0" },
        }),
      ),
    ).toBeInstanceOf(Error);
    expect(
      await failure(
        capturePredeployBackup({
          ...config,
          databases: config.databases.filter((db) => db.name !== "auth.db"),
        }),
      ),
    ).toBeInstanceOf(Error);
    await rm(config.databases[0]?.source ?? "missing");
    expect(String(await failure(capturePredeployBackup(config)))).toContain(
      "Required database missing",
    );
    expect(
      await Bun.file(join(config.backupDir, "manifest.json")).exists(),
    ).toBe(false);
  });

  it("refuses processing jobs instead of publishing an unsafe recovery point", async () => {
    const { config } = await fixture();
    const jobs = config.databases.find((db) => db.name === "brain-jobs.db");
    if (!jobs) throw new Error("Missing job fixture");
    const db = await connect(jobs.source);
    await db.exec("UPDATE job_queue SET status = 'processing'");
    await db.close();
    const originalHashes = await hashes(config);
    expect(String(await failure(capturePredeployBackup(config)))).toContain(
      "Processing jobs remain",
    );
    expect(await hashes(config)).toEqual(originalHashes);
    expect(
      await Bun.file(join(config.backupDir, "manifest.json")).exists(),
    ).toBe(false);
  });

  it("rejects corrupted artifacts and existing restore destinations without overwriting them", async () => {
    const { root, config } = await fixture();
    await capturePredeployBackup(config);
    const existing = join(root, "existing");
    await mkdir(existing);
    await writeFile(join(existing, "keep"), "untouched");
    expect(
      await failure(
        restorePredeployBackup({
          backupDir: config.backupDir,
          destination: existing,
        }),
      ),
    ).toBeInstanceOf(Error);
    expect(await readFile(join(existing, "keep"), "utf8")).toBe("untouched");
    await writeFile(join(config.backupDir, "auth.db"), "corrupted");
    const destination = join(root, "bad-restore");
    expect(
      await failure(
        restorePredeployBackup({ backupDir: config.backupDir, destination }),
      ),
    ).toBeInstanceOf(Error);
    expect(await failure(lstat(destination))).toBeInstanceOf(Error);
    expect(await failure(lstat(`${destination}.restore-lock`))).toBeInstanceOf(
      Error,
    );
  });
});
