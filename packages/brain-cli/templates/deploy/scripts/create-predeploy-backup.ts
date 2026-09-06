import { Buffer } from "node:buffer";
import {
  parseTursoBackupManifest,
  parseBackupRuntimeEnvironment,
} from "./helpers";
import { appendFileSync } from "node:fs";
import {
  chmod,
  lstat,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  realpath,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import {
  captureTursoDatabases,
  verifyStoppedDatabaseSources,
  copyPrivateFile,
  fileSha256,
  regularFile,
  restoreTursoDatabases,
  TURSO_BACKUP_DATABASE_NAMES,
  type TursoDatabaseSource,
} from "./turso-backup";

export const DEFAULT_PREDEPLOY_BACKUP_RETENTION_COUNT = 5;
export const PREDEPLOY_BACKUP_TOOL_VERSION = "brains-predeploy-backup-v2";
export type PredeployDatabaseSource = TursoDatabaseSource;

export interface PredeployBackupMetadata {
  snapshotId: string;
  targetHandle: string;
  host: string;
  startedAt: string;
  sourceVersion: string;
  targetVersion: string;
  toolVersion: string;
  containerId: string;
  imageId: string;
  imageDigest: string;
}
export interface PredeployCaptureConfig {
  backupDir: string;
  contentRoot: string;
  databases: PredeployDatabaseSource[];
  sourceStopped: boolean;
  configuration: {
    brainYaml: string;
    runtimeConfig: string;
    environmentFile: string;
  };
  metadata: PredeployBackupMetadata;
}
export type PredeployBackupResult =
  | { applicable: false }
  | {
      applicable: true;
      snapshotId: string;
      backupPath: string;
      sourceVersion: string;
      targetVersion: string;
      totalBytes: number;
      durationSeconds: number;
      verification: "passed";
    };
interface CommandResult {
  stdout: Uint8Array;
  stderr: Uint8Array;
}
interface GitCaptureRecord {
  head: string;
  tree: string;
  branch: string;
  upstream: string;
  trackingHead: string;
  aheadBehind: string;
  clean: boolean;
  stagedPatchBytes: number;
  unstagedPatchBytes: number;
  untrackedFiles: number;
  ignoredFiles: number;
  bundleVerified: true;
}
interface Artifact {
  name: string;
  sha256: string;
}
interface RestoreManifest {
  git: { head: string; branch: string };
  databases: Array<{ name: string; sha256: string }>;
  artifacts: Artifact[];
}

async function runCommand(
  command: string,
  args: string[],
  cwd?: string,
): Promise<CommandResult> {
  const child = Bun.spawn([command, ...args], {
    ...(cwd ? { cwd } : {}),
    stdout: "pipe",
    stderr: "pipe",
  });
  const [exitCode, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).bytes(),
    new Response(child.stderr).bytes(),
  ]);
  if (exitCode !== 0)
    throw new Error(`${command} ${args[0] ?? ""} failed with exit ${exitCode}`);
  return { stdout, stderr };
}
function text(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes).trim();
}
function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  return Buffer.from(a).equals(Buffer.from(b));
}
function nullDelimitedCount(bytes: Uint8Array): number {
  return bytes.filter((byte) => byte === 0).length;
}
const gitCommand = (root: string, args: string[]): Promise<CommandResult> =>
  runCommand(
    "git",
    [
      "--no-optional-locks",
      "-c",
      `safe.directory=${root}`,
      "-c",
      "core.fsmonitor=false",
      "-c",
      "maintenance.auto=false",
      "-c",
      "gc.auto=0",
      ...args,
    ],
    root,
  );

async function captureGitCheckout(
  contentRoot: string,
  backupDir: string,
): Promise<GitCaptureRecord> {
  const git = (args: string[]): Promise<CommandResult> =>
    gitCommand(contentRoot, args);
  const head = text((await git(["rev-parse", "HEAD"])).stdout);
  const tree = text((await git(["rev-parse", "HEAD^{tree}"])).stdout);
  const branch = text((await git(["branch", "--show-current"])).stdout);
  await git(["check-ref-format", "--branch", branch]);
  const upstream = text(
    (await git(["rev-parse", "--abbrev-ref", "@{upstream}"])).stdout,
  );
  // No remote calls or credentials are needed in the isolated recovery container.
  const trackingHead = text((await git(["rev-parse", "@{upstream}"])).stdout);
  const aheadBehind = text(
    (await git(["rev-list", "--left-right", "--count", "HEAD...@{upstream}"]))
      .stdout,
  );
  const commands = [
    ["status", "--porcelain=v1", "--untracked-files=all"],
    ["diff", "--cached", "--binary", "--full-index"],
    ["diff", "--binary", "--full-index"],
    ["ls-files", "--others", "--exclude-standard", "-z"],
    ["ls-files", "--others", "--ignored", "--exclude-standard", "-z"],
    ["show-ref"],
  ];
  const results = await Promise.all(commands.map(git));
  const [status, staged, unstaged, untracked, ignored, refs] = results;
  if (!status || !staged || !unstaged || !untracked || !ignored || !refs)
    throw new Error("Missing Git capture evidence");
  for (const [name, bytes] of [
    ["content-status.txt", status.stdout],
    ["content-staged.patch", staged.stdout],
    ["content-unstaged.patch", unstaged.stdout],
    ["content-untracked.zlist", untracked.stdout],
    ["content-ignored.zlist", ignored.stdout],
    ["content-refs.txt", refs.stdout],
  ] as const)
    await writeFile(join(backupDir, name), bytes, { mode: 0o600 });
  await writeFile(join(backupDir, "content-head.txt"), `${head}\n`, {
    mode: 0o600,
  });
  await writeFile(join(backupDir, "content-tree.txt"), `${tree}\n`, {
    mode: 0o600,
  });
  await git(["bundle", "create", join(backupDir, "content.bundle"), "--all"]);
  await git(["bundle", "verify", join(backupDir, "content.bundle")]);
  for (const kind of ["untracked", "ignored"]) {
    await runCommand("tar", [
      "--null",
      "--no-recursion",
      "-C",
      contentRoot,
      "-cf",
      join(backupDir, `content-${kind}.tar`),
      `--files-from=${join(backupDir, `content-${kind}.zlist`)}`,
    ]);
    await runCommand("tar", [
      "--compare",
      `--file=${join(backupDir, `content-${kind}.tar`)}`,
      "-C",
      contentRoot,
    ]);
  }
  const after = await Promise.all(commands.map(git));
  if (
    text((await git(["rev-parse", "HEAD"])).stdout) !== head ||
    results.some(
      (result, i) =>
        !bytesEqual(result.stdout, after[i]?.stdout ?? new Uint8Array()),
    )
  )
    throw new Error("Content checkout changed during snapshot capture");
  return {
    head,
    tree,
    branch,
    upstream,
    trackingHead,
    aheadBehind,
    clean: status.stdout.length === 0,
    stagedPatchBytes: staged.stdout.length,
    unstagedPatchBytes: unstaged.stdout.length,
    untrackedFiles: nullDelimitedCount(untracked.stdout),
    ignoredFiles: nullDelimitedCount(ignored.stdout),
    bundleVerified: true,
  };
}

async function verifyContentEvidence(
  content: string,
  backupDir: string,
  head: string,
): Promise<void> {
  const evidence = [
    [
      "content-status.txt",
      ["status", "--porcelain=v1", "--untracked-files=all"],
    ],
    ["content-refs.txt", ["show-ref"]],
    ["content-staged.patch", ["diff", "--cached", "--binary", "--full-index"]],
    ["content-unstaged.patch", ["diff", "--binary", "--full-index"]],
    [
      "content-untracked.zlist",
      ["ls-files", "--others", "--exclude-standard", "-z"],
    ],
    [
      "content-ignored.zlist",
      ["ls-files", "--others", "--ignored", "--exclude-standard", "-z"],
    ],
  ] as const;
  for (const [file, args] of evidence) {
    if (
      !bytesEqual(
        (await gitCommand(content, [...args])).stdout,
        await readFile(join(backupDir, file)),
      )
    )
      throw new Error(`Git state differs from the snapshot: ${file}`);
  }
  if (text((await gitCommand(content, ["rev-parse", "HEAD"])).stdout) !== head)
    throw new Error("Git HEAD differs from the snapshot");
  for (const kind of ["untracked", "ignored"])
    await runCommand("tar", [
      "--compare",
      "-C",
      content,
      "-f",
      join(backupDir, `content-${kind}.tar`),
    ]);
}

async function restoreContents(
  backupDir: string,
  destination: string,
  manifest: RestoreManifest,
): Promise<void> {
  for (const artifact of manifest.artifacts) {
    await regularFile(join(backupDir, artifact.name));
    if ((await fileSha256(join(backupDir, artifact.name))) !== artifact.sha256)
      throw new Error(`Snapshot artifact checksum mismatch: ${artifact.name}`);
  }
  await restoreTursoDatabases({
    backupDir,
    destination: join(destination, "data"),
    databases: manifest.databases,
  });
  const content = join(destination, "content");
  await runCommand("git", [
    "clone",
    "--no-checkout",
    join(backupDir, "content.bundle"),
    content,
  ]);
  const git = (args: string[]): Promise<CommandResult> =>
    gitCommand(content, args);
  // Drop clone-generated tracking refs, then restore ALL saved refs (including
  // local-only branches and stashes), not just the checked-out branch.
  await git(["remote", "remove", "origin"]);
  await git([
    "fetch",
    "--no-write-fetch-head",
    "--update-head-ok",
    join(backupDir, "content.bundle"),
    "+refs/*:refs/*",
  ]);
  await git(["check-ref-format", "--branch", manifest.git.branch]);
  await git(["checkout", "-B", manifest.git.branch, manifest.git.head]);
  for (const kind of ["staged", "unstaged"]) {
    const patch = join(backupDir, `content-${kind}.patch`);
    if ((await lstat(patch)).size > 0)
      await git([
        "apply",
        "--binary",
        ...(kind === "staged" ? ["--index"] : []),
        patch,
      ]);
  }
  for (const kind of ["untracked", "ignored"]) {
    await runCommand("tar", [
      "--extract",
      "--keep-old-files",
      "--no-same-owner",
      "-C",
      content,
      "-f",
      join(backupDir, `content-${kind}.tar`),
    ]);
  }
  await verifyContentEvidence(content, backupDir, manifest.git.head);
  // No configured remote remains; operators reconnect only after recovery checks.
  await copyPrivateFile(
    join(backupDir, "brain.yaml"),
    join(destination, "brain.yaml"),
  );
  await copyPrivateFile(
    join(backupDir, "runtime-environment.json"),
    join(destination, "runtime-environment.json"),
  );
  await mkdir(join(destination, "config"), { mode: 0o700 });
  await runCommand("tar", [
    "--extract",
    "--no-same-owner",
    "-C",
    join(destination, "config"),
    "-f",
    join(backupDir, "runtime-config.tar"),
  ]);
  await runCommand("tar", [
    "--compare",
    "-C",
    join(destination, "config"),
    "-f",
    join(backupDir, "runtime-config.tar"),
  ]);
  await mkdir(join(destination, "deployment"), { mode: 0o700 });
  for (const artifact of manifest.artifacts) {
    if (
      artifact.name.startsWith("container-") ||
      artifact.name.startsWith("worker-")
    )
      await copyPrivateFile(
        join(backupDir, artifact.name),
        join(destination, "deployment", artifact.name),
      );
  }
  // Detect mutation of any snapshot artifacts during restore, too.
  for (const artifact of manifest.artifacts) {
    if ((await fileSha256(join(backupDir, artifact.name))) !== artifact.sha256)
      throw new Error("Snapshot changed during restore");
  }
}

export async function capturePredeployBackup(
  config: PredeployCaptureConfig,
): Promise<void> {
  if (!config.sourceStopped)
    throw new Error("All source writers must be stopped before capture");
  if (!/^0\.3\./.test(config.metadata.sourceVersion))
    throw new Error(
      "This backup tool requires a 0.3 Turso runtime; use the 0.2 tooling for 0.2 snapshots",
    );
  if (await Bun.file(join(config.backupDir, "manifest.json")).exists())
    throw new Error("Backup manifest already exists");
  const backupRoot = await realpath(config.backupDir);
  for (const directory of [
    config.contentRoot,
    config.configuration.runtimeConfig,
  ]) {
    const sourceRoot = await realpath(directory);
    if (
      backupRoot === sourceRoot ||
      backupRoot.startsWith(`${sourceRoot}/`) ||
      sourceRoot.startsWith(`${backupRoot}/`)
    )
      throw new Error(
        "Backup staging must not overlap content or configuration",
      );
  }
  await chmod(config.backupDir, 0o700);
  const databases = await captureTursoDatabases(config);
  const git = await captureGitCheckout(config.contentRoot, config.backupDir);
  await copyPrivateFile(
    config.configuration.brainYaml,
    join(config.backupDir, "brain.yaml"),
  );
  const environment = join(config.backupDir, "runtime-environment.json");
  if (resolve(config.configuration.environmentFile) !== resolve(environment))
    await copyPrivateFile(config.configuration.environmentFile, environment);
  await regularFile(environment);
  parseBackupRuntimeEnvironment(
    JSON.parse(await readFile(environment, "utf8")),
  );
  await runCommand("tar", [
    "-C",
    config.configuration.runtimeConfig,
    "-cf",
    join(config.backupDir, "runtime-config.tar"),
    ".",
  ]);
  await runCommand("tar", [
    "--compare",
    "-C",
    config.configuration.runtimeConfig,
    "-f",
    join(config.backupDir, "runtime-config.tar"),
  ]);
  const artifacts: Artifact[] = [];
  for (const name of (await readdir(config.backupDir)).sort()) {
    const path = join(config.backupDir, name);
    await regularFile(path);
    await chmod(path, 0o600);
    artifacts.push({ name, sha256: await fileSha256(path) });
  }
  const rehearsal = await mkdtemp(join(config.backupDir, ".restore-"));
  try {
    await restoreContents(config.backupDir, rehearsal, {
      git,
      databases,
      artifacts,
    });
  } finally {
    await rm(rehearsal, { recursive: true, force: true });
  }
  await verifyStoppedDatabaseSources(databases);
  await verifyContentEvidence(config.contentRoot, config.backupDir, git.head);
  if (
    (await fileSha256(config.configuration.brainYaml)) !==
    (await fileSha256(join(config.backupDir, "brain.yaml")))
  )
    throw new Error("Configuration changed during backup");
  await runCommand("tar", [
    "--compare",
    "-C",
    config.configuration.runtimeConfig,
    "-f",
    join(config.backupDir, "runtime-config.tar"),
  ]);
  const manifest = {
    ...config.metadata,
    schemaVersion: 2,
    outcome: "verified",
    engine: "turso",
    capture: "all-writers-stopped",
    restoreVerified: true,
    completedAt: new Date().toISOString(),
    databases,
    git,
    artifacts,
  };
  await writeFile(
    join(config.backupDir, "manifest.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
    { mode: 0o600 },
  );
  await writeFile(
    join(config.backupDir, "manifest.sha256"),
    `${await fileSha256(join(config.backupDir, "manifest.json"))}  manifest.json\n`,
    { mode: 0o600 },
  );
}

/** Restores into private staging, verifies, then atomically publishes a NEW directory. */
export async function restorePredeployBackup(options: {
  backupDir: string;
  destination: string;
  signal?: AbortSignal;
}): Promise<string> {
  options.signal?.throwIfAborted();
  const source = await realpath(options.backupDir);
  const destination = join(
    await realpath(dirname(resolve(options.destination))),
    basename(resolve(options.destination)),
  );
  if (destination === source || destination.startsWith(`${source}/`))
    throw new Error("Restore destination must be outside the backup");
  const lock = `${destination}.restore-lock`;
  await mkdir(lock, { mode: 0o700 });
  let stage: string | undefined;
  try {
    try {
      await lstat(destination);
      throw new Error("Restore destination already exists");
    } catch (error) {
      if (!(
        error instanceof Error &&
        "code" in error &&
        error.code === "ENOENT"
      ))
        throw error;
    }
    const path = join(source, "manifest.json");
    await regularFile(path);
    await regularFile(join(source, "manifest.sha256"));
    const expected = (await readFile(join(source, "manifest.sha256"), "utf8"))
      .split(/\r?\n/)
      .filter((line) => /^[a-f0-9]{64}\s+\*?manifest\.json$/.test(line));
    if (
      expected.length !== 1 ||
      expected[0]?.slice(0, 64) !== (await fileSha256(path))
    )
      throw new Error("Backup manifest checksum mismatch");
    const manifest = parseTursoBackupManifest(
      JSON.parse(await readFile(path, "utf8")),
    );
    stage = await mkdtemp(
      join(
        dirname(destination),
        `.${basename(destination)}.restore-incomplete-`,
      ),
    );
    await restoreContents(source, stage, manifest);
    await copyPrivateFile(path, join(stage, "restore-manifest.json"));
    if ((await fileSha256(path)) !== expected[0].slice(0, 64))
      throw new Error("Manifest changed during restore");
    try {
      await lstat(destination);
      throw new Error("Restore destination appeared during verification");
    } catch (error) {
      if (!(
        error instanceof Error &&
        "code" in error &&
        error.code === "ENOENT"
      ))
        throw error;
    }
    options.signal?.throwIfAborted();
    await rename(stage, destination);
    return destination;
  } catch (error) {
    throw new Error(
      `Restore failed${stage ? `; incomplete output retained at ${stage}` : ""}`,
      { cause: error },
    );
  } finally {
    await rm(lock, { recursive: true });
  }
}

function envValue(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}
function captureConfigFromEnvironment(): PredeployCaptureConfig {
  return {
    backupDir: envValue("BACKUP_DIR"),
    contentRoot: "/app/brain-data",
    sourceStopped: envValue("WRITERS_STOPPED") === "true",
    databases: TURSO_BACKUP_DATABASE_NAMES.map((name) => ({
      name,
      source: name === "auth.db" ? "/app/data/auth/auth.db" : `/data/${name}`,
    })),
    configuration: {
      brainYaml: "/app/brain.yaml",
      runtimeConfig: "/config",
      environmentFile: `${envValue("BACKUP_DIR")}/runtime-environment.json`,
    },
    metadata: {
      snapshotId: envValue("SNAPSHOT_ID"),
      targetHandle: envValue("TARGET_HANDLE"),
      host: envValue("HOST_IDENTIFIER"),
      startedAt: envValue("STARTED_AT"),
      sourceVersion: envValue("SOURCE_VERSION"),
      targetVersion: envValue("TARGET_VERSION"),
      toolVersion: envValue("TOOL_VERSION"),
      containerId: envValue("CONTAINER_ID"),
      imageId: envValue("SOURCE_IMAGE_ID"),
      // Locally built images have an immutable image ID but no registry digest.
      imageDigest: process.env["SOURCE_IMAGE_DIGEST"] ?? "",
    },
  };
}
function shellSafe(value: string, name: string): string {
  if (!/^[A-Za-z0-9._-]+$/.test(value))
    throw new Error(`${name} contains unsupported characters`);
  return value;
}

export function renderPredeployBackupRemoteScript(options?: {
  captureProgramBase64?: string;
}): string {
  const program =
    options?.captureProgramBase64 ??
    Buffer.from("capture-program").toString("base64");
  return `#!/usr/bin/env bash
set -euo pipefail
umask 077
TARGET_HANDLE="$1"
TARGET_VERSION="$2"
SERVICE_NAME="$3"
DEFAULT_RETENTION_COUNT="$4"
TOOL_VERSION="${PREDEPLOY_BACKUP_TOOL_VERSION}"
CAPTURE_PROGRAM_BASE64="${program}"
state_root="/opt/brain-state"
runtime_root="/opt/brain-runtime"
content_root="/opt/brain-data"
backup_root="\${state_root}/backups"
# Coordinate with other backups and the health watchdog for the entire outage.
exec 8>/run/brains-offline-backup.lock
flock -n 8 || { echo "pre-deploy snapshot: another backup is running" >&2; exit 1; }
exec 9>/run/brains-health-watchdog.lock
flock 9
maintenance="$state_root/offline-backup-in-progress"
if [ -e "$maintenance" ]; then echo "pre-deploy snapshot: unfinished offline backup; operator recovery required" >&2; exit 1; fi
mapfile -t containers < <(docker ps --filter "label=service=\${SERVICE_NAME}" --filter label=role=web --format '{{.ID}}')
if [ "\${#containers[@]}" -gt 1 ]; then echo "pre-deploy snapshot: ambiguous runtime" >&2; exit 1; fi
if [ "\${#containers[@]}" -eq 0 ]; then
  for path in "$state_root" "$runtime_root" "$content_root" /opt/brain.yaml /opt/brain-dist; do
    if [ -f "$path" ] || { [ -d "$path" ] && find "$path" -mindepth 1 -print -quit | grep -q .; }; then
      echo "pre-deploy snapshot: persistent state exists without an identifiable runtime" >&2; exit 1
    fi
  done
  echo "pre-deploy snapshot: not applicable (new server)"; exit 0
fi
container="\${containers[0]}"
if [ "$(docker inspect "$container" --format '{{.State.Health.Status}}')" != healthy ]; then
  echo "pre-deploy snapshot: current runtime is not healthy" >&2; exit 1
fi
mounts="$(docker inspect "$container" --format '{{range .Mounts}}{{println .Source .Destination}}{{end}}')"
for mount in "$state_root /data" "$runtime_root /app/data" "$content_root /app/brain-data" '/opt/brain-config /config' '/opt/brain.yaml /app/brain.yaml'; do
  if ! grep -Fxq "$mount" <<< "$mounts"; then echo "pre-deploy snapshot: noncanonical mounts require a dedicated backup configuration" >&2; exit 1; fi
done
source_version="$(docker exec "$container" bun -e 'process.stdout.write((await Bun.file("/app/node_modules/@rizom/brain/package.json").json()).version)')"
case "$source_version" in 0.3.*) ;; *) echo "pre-deploy snapshot: use 0.2 tooling to back up a 0.2 runtime" >&2; exit 1 ;; esac
# The supervisor closes admissions and drains workers on SIGTERM. Refuse busy
# queues before shutdown; the cold copy checks again for unfinished side effects.
docker exec "$container" bun -e '
const r = await fetch("http://127.0.0.1:8080/health/ready"); const h = await r.json(); const q = h.resources?.queue;
if (r.status !== 200 || h.status !== "ready" || h.operationalStatus !== "operational" || !q || q.totals?.pending !== 0 || q.totals?.processing !== 0 || q.staleLeaseCount !== 0) process.exit(1);
'
mapfile -t all_containers < <(docker ps --filter "label=service=\${SERVICE_NAME}" --format '{{.ID}}')
workers=()
for id in "\${all_containers[@]}"; do
  [ "$id" != "$container" ] || continue
  if [ "$(docker inspect "$id" --format '{{index .Config.Labels "role"}}')" != worker ]; then
    echo "pre-deploy snapshot: unknown writer role" >&2; exit 1
  fi
  workers+=("$id")
done
required_databases=("$state_root/brain.db" "$state_root/brain-jobs.db" "$state_root/conversations.db" "$state_root/runtime-state.db" "$runtime_root/auth/auth.db")
state_bytes=0
for database in "\${required_databases[@]}"; do
  test -f "$database"
  state_bytes=$((state_bytes + $(stat -c %s "$database")))
  if [ -f "$database-wal" ]; then state_bytes=$((state_bytes + $(stat -c %s "$database-wal"))); fi
done
test -d "$content_root/.git"
test -d /opt/brain-config
test -f /opt/brain.yaml
base_bytes=$((state_bytes + $(du -sb "$content_root" | cut -f1) + $(du -sb /opt/brain-config | cut -f1)))
required_bytes=$((base_bytes * 3 + 1073741824))
available_bytes="$(df --output=avail -B1 "$state_root" | tail -1 | tr -d ' ')"
if [ "$available_bytes" -lt "$required_bytes" ]; then echo "pre-deploy snapshot: insufficient disk" >&2; exit 1; fi
install -d -m 700 "$backup_root"
started_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
snapshot_id="predeploy-\${TARGET_HANDLE}-\${TARGET_VERSION:0:12}-$(date -u +%Y%m%dT%H%M%S)-$$"
incomplete="\${backup_root}/\${snapshot_id}.incomplete"
final="\${backup_root}/\${snapshot_id}"
test ! -e "$incomplete"; test ! -e "$final"
install -d -m 700 "$incomplete"
source_image_id="$(docker inspect "$container" --format '{{.Image}}')"
source_image_digest="$(docker image inspect "$source_image_id" --format '{{join .RepoDigests ","}}')"
# Secret-bearing evidence goes directly to a private file, NEVER stdout/logs.
docker inspect "$container" --format '{{json .Config.Env}}' > "$incomplete/runtime-environment.json"
docker inspect "$container" --format '{{json .Mounts}}' > "$incomplete/container-mounts.json"
docker inspect "$container" --format '{{json .State}}' > "$incomplete/container-state.json"
for id in "\${workers[@]}"; do
  docker inspect "$id" --format '{"id":{{json .Id}},"image":{{json .Image}},"environment":{{json .Config.Env}},"mounts":{{json .Mounts}}}' > "$incomplete/worker-$id.json"
done

wait_healthy() (
  local id="$1" generation generation_ns
  generation="$(docker inspect "$id" --format '{{.State.StartedAt}}')" || exit 1
  generation_ns="$(date -u -d "$generation" +%s%N)" || exit 1
  # Docker may replay events at second granularity. Reject the previous run's
  # healthy/die events using the daemon's exact start timestamp, not host time.
  coproc events { exec docker events --since "$generation" --filter "container=$id" --format '{{.TimeNano}} {{.Action}}'; }
  local event_pid="$events_PID" event_fd="\${events[0]}"
  trap 'kill "$event_pid" 2>/dev/null || true; wait "$event_pid" 2>/dev/null || true' EXIT
  local state="$(docker inspect "$id" --format '{{.State.Status}} {{.State.Health.Status}}')"
  case "$state" in 'running healthy') exit 0 ;; 'running starting') ;; *) exit 1 ;; esac
  while read -r event_ns event <&"$event_fd"; do
    [[ "$event_ns" =~ ^[0-9]+$ ]] || exit 1
    [ "$event_ns" -ge "$generation_ns" ] || continue
    case "$event" in 'health_status: healthy') exit 0 ;; 'health_status: unhealthy'|die|destroy) exit 1 ;; esac
  done
  exit 1
)
stopped=()
helper=""
restart_originals() {
  [ "\${#stopped[@]}" -gt 0 ] || return 0
  # Start owner before endpoint-backed workers, then use Docker events, not polls.
  docker start "$container" >/dev/null || return 1
  for id in "\${workers[@]}"; do docker start "$id" >/dev/null || return 1; done
  wait_healthy "$container" || return 1
  docker exec "$container" bun -e 'const r = await fetch("http://127.0.0.1:8080/health/ready"); const h = await r.json(); if (r.status !== 200 || h.status !== "ready" || h.operationalStatus !== "operational") process.exit(1);' || return 1
  stopped=()
}
cleanup() {
  local result=$?
  trap - EXIT INT TERM HUP
  if [ -n "$helper" ]; then docker rm -f "$helper" >/dev/null 2>&1 || true; fi
  if restart_originals; then rm -f "$maintenance";
  else echo "pre-deploy snapshot: original runtime restart/readiness failed; operator recovery required" >&2; result=1; fi
  exit "$result"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
trap 'exit 129' HUP
printf '%s\\n' "snapshot=$snapshot_id" "helper=brains-backup-\${snapshot_id}" "owner=$container" "workers=\${workers[*]}" > "$maintenance"
for id in "\${workers[@]}" "$container"; do
  stopped+=("$id")
  docker stop -t -1 "$id" >/dev/null
  stop_state="$(docker inspect "$id" --format '{{.State.Status}} {{.State.ExitCode}} {{.State.OOMKilled}}')"
  case "$stop_state" in 'exited 0 false'|'exited 143 false') ;; *) echo "pre-deploy snapshot: writer did not stop cleanly" >&2; exit 1 ;; esac
done
running="$(docker ps --filter "label=service=\${SERVICE_NAME}" --format '{{.ID}}')"
if [ -n "$running" ]; then echo "pre-deploy snapshot: writer appeared during shutdown" >&2; exit 1; fi
helper="brains-backup-\${snapshot_id}"
# Same native engine as the source. Source mounts are READ ONLY; only staging is writable.
printf '%s' "$CAPTURE_PROGRAM_BASE64" | base64 -d | docker run --rm -i --name "$helper" --network none --user 0:0 --no-healthcheck --label ai.rizom.brain.watchdog=false \
  --volumes-from "$container:ro" --volume "$incomplete:/backup:rw" \
  -e BACKUP_DIR=/backup -e WRITERS_STOPPED=true -e SNAPSHOT_ID="$snapshot_id" \
  -e TARGET_HANDLE="$TARGET_HANDLE" -e HOST_IDENTIFIER="$(hostname)" -e STARTED_AT="$started_at" \
  -e SOURCE_VERSION="$source_version" -e TARGET_VERSION="$TARGET_VERSION" -e TOOL_VERSION="$TOOL_VERSION" \
  -e CONTAINER_ID="$container" -e SOURCE_IMAGE_ID="$source_image_id" -e SOURCE_IMAGE_DIGEST="$source_image_digest" \
  --entrypoint bun "$source_image_id" run - --capture
helper=""
running="$(docker ps --filter "label=service=\${SERVICE_NAME}" --format '{{.ID}}')"
if [ -n "$running" ]; then echo "pre-deploy snapshot: writer appeared during capture" >&2; exit 1; fi
chmod 600 "$incomplete"/*
(
  cd "$incomplete"
  : > manifest.sha256
  while IFS= read -r file; do sha256sum "$file" >> manifest.sha256; done < <(find . -mindepth 1 -maxdepth 1 -type f ! -name manifest.sha256 -printf '%f\\n' | sort)
  sha256sum --check manifest.sha256 >/dev/null
)
restart_originals
mv "$incomplete" "$final"
(cd "$final" && sha256sum --check manifest.sha256 >/dev/null)
# Never prune retained 0.2 rollback snapshots or incomplete captures.
prune_verified() {
  local limit="$1" preserve="$2" candidates=()
  shopt -s nullglob
  for candidate in "$backup_root"/predeploy-"$TARGET_HANDLE"-*; do
    case "$candidate" in *.incomplete) continue ;; esac
    [ -f "$candidate/manifest.json" ] && [ -f "$candidate/manifest.sha256" ] || continue
    grep -q '"engine": "turso"' "$candidate/manifest.json" || continue
    grep -q '"outcome": "verified"' "$candidate/manifest.json" || continue
    (cd "$candidate" && sha256sum --check --status manifest.sha256) || continue
    candidates+=("$candidate")
  done
  local remove_count=$((\${#candidates[@]} - limit))
  for candidate in "\${candidates[@]}"; do
    [ "$remove_count" -gt 0 ] || break
    [ "$candidate" != "$preserve" ] || continue
    rm -rf -- "$candidate"; remove_count=$((remove_count - 1))
  done
}
prune_verified "$DEFAULT_RETENTION_COUNT" "$final"
echo "SNAPSHOT_ID=$snapshot_id"
echo "BACKUP=$final"
echo "SOURCE_VERSION=$source_version"
echo "TARGET_VERSION=$TARGET_VERSION"
echo "TOTAL_BYTES=$(du -sb "$final" | cut -f1)"
echo "DURATION_SECONDS=$(( $(date -u +%s) - $(date -u -d "$started_at" +%s) ))"
echo "VERIFICATION=passed"
`;
}

export function parsePredeployBackupOutput(
  output: string,
): PredeployBackupResult {
  if (output.includes("pre-deploy snapshot: not applicable (new server)"))
    return { applicable: false };
  const values = new Map<string, string>();
  for (const line of output.split(/\r?\n/)) {
    const index = line.indexOf("=");
    if (index > 0) values.set(line.slice(0, index), line.slice(index + 1));
  }
  const snapshotId = values.get("SNAPSHOT_ID"),
    backupPath = values.get("BACKUP"),
    sourceVersion = values.get("SOURCE_VERSION"),
    targetVersion = values.get("TARGET_VERSION");
  const totalBytes = Number(values.get("TOTAL_BYTES")),
    durationSeconds = Number(values.get("DURATION_SECONDS"));
  if (
    !snapshotId ||
    !backupPath ||
    !sourceVersion ||
    !targetVersion ||
    !Number.isSafeInteger(totalBytes) ||
    totalBytes < 0 ||
    !Number.isSafeInteger(durationSeconds) ||
    durationSeconds < 0 ||
    values.get("VERIFICATION") !== "passed"
  )
    throw new Error("Incomplete predeploy backup result");
  return {
    applicable: true,
    snapshotId,
    backupPath,
    sourceVersion,
    targetVersion,
    totalBytes,
    durationSeconds,
    verification: "passed",
  };
}
export async function runPredeployBackup(): Promise<PredeployBackupResult> {
  const retention = Number(
    process.env["PREDEPLOY_BACKUP_RETENTION_COUNT"] ??
      DEFAULT_PREDEPLOY_BACKUP_RETENTION_COUNT,
  );
  if (!Number.isInteger(retention) || retention < 1 || retention > 100)
    throw new Error(
      "PREDEPLOY_BACKUP_RETENTION_COUNT must be between 1 and 100",
    );
  // Scaffolded scripts keep local helpers. Bundle those before sending one stdin
  // program to the source image; never rely on workspace imports in a consumer.
  const bundle = await Bun.build({
    entrypoints: [import.meta.path],
    target: "bun",
    external: ["@tursodatabase/database"],
  });
  const artifact = bundle.outputs[0];
  if (!bundle.success || !artifact)
    throw new Error("Could not bundle the backup capture program");
  const script = renderPredeployBackupRemoteScript({
    captureProgramBase64: Buffer.from(await artifact.arrayBuffer()).toString(
      "base64",
    ),
  });
  const child = Bun.spawn(
    [
      "ssh",
      `${shellSafe(process.env["SSH_USER"] ?? "root", "SSH_USER")}@${shellSafe(envValue("SERVER_IP"), "SERVER_IP")}`,
      "bash",
      "-s",
      "--",
      ...["TARGET_HANDLE", "TARGET_VERSION", "SERVICE_NAME"].map((name) =>
        shellSafe(envValue(name), name),
      ),
      String(retention),
    ],
    { stdin: "pipe", stdout: "pipe", stderr: "pipe" },
  );
  await child.stdin.write(script);
  await child.stdin.end();
  const [code, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  if (code !== 0)
    throw new Error(`Predeploy backup failed: ${stderr.trim().slice(0, 1000)}`);
  const result = parsePredeployBackupOutput(stdout);
  const output = process.env["GITHUB_OUTPUT"],
    summary = process.env["GITHUB_STEP_SUMMARY"];
  if (output)
    appendFileSync(
      output,
      result.applicable
        ? `applicable=true\nsnapshot_id=${result.snapshotId}\nbackup_path=${result.backupPath}\n`
        : "applicable=false\n",
    );
  if (summary)
    appendFileSync(
      summary,
      result.applicable
        ? `### Verified offline pre-deploy snapshot\n- Snapshot: \`${result.snapshotId}\`\n- Path: \`${result.backupPath}\`\n- Capture and isolated restore: passed\n`
        : "### Pre-deploy snapshot\nNot applicable: new server.\n",
    );
  console.log(
    result.applicable
      ? `pre-deploy snapshot verified: ${result.snapshotId}`
      : "pre-deploy snapshot: not applicable (new server)",
  );
  return result;
}
if (import.meta.main) {
  if (process.argv.includes("--capture"))
    await capturePredeployBackup(captureConfigFromEnvironment());
  else if (process.argv.includes("--restore")) {
    const controller = new AbortController();
    const cancel = (): void => controller.abort(new Error("Restore cancelled"));
    process.once("SIGINT", cancel);
    process.once("SIGTERM", cancel);
    console.log(
      `Verified restore: ${await restorePredeployBackup({ backupDir: envValue("BACKUP_DIR"), destination: envValue("RESTORE_DIR"), signal: controller.signal })}`,
    );
  } else await runPredeployBackup();
}
