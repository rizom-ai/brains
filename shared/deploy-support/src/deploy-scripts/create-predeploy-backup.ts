import { Database } from "bun:sqlite";
import { Buffer } from "node:buffer";
import { appendFileSync } from "node:fs";
import { isPlainRecord } from "@brains/utils/predicates";

/**
 * The slice of `@libsql/client` this script uses.
 *
 * Declared here because the import is dynamic — the package is optional, and
 * only the libsql quick-check driver needs it.
 */
interface LibsqlModule {
  createClient(options: { url: string }): {
    execute(sql: string): Promise<{
      rows: Array<Record<string | number, unknown>>;
    }>;
    close(): void;
  };
}

export const DEFAULT_PREDEPLOY_BACKUP_RETENTION_COUNT = 5;
export const PREDEPLOY_BACKUP_TOOL_VERSION = "brains-predeploy-backup-v1";

type DatabaseCaptureMethod = "vacuum" | "serialize";
type QuickCheckDriver = "bun" | "libsql";

export interface PredeployDatabaseSource {
  source: string;
  name: string;
  method: DatabaseCaptureMethod;
  quickCheck: QuickCheckDriver;
  logicalVector: boolean;
}

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

interface DatabaseCaptureRecord extends Omit<
  PredeployDatabaseSource,
  "quickCheck"
> {
  status: "captured";
  required: true;
  startedAt: string;
  completedAt: string;
  bytes: number;
  sha256: string;
  quickCheckDriver: QuickCheckDriver;
  quickCheck: string;
}

interface GitCaptureRecord {
  head: string;
  tree: string;
  branch: string;
  upstream: string;
  observedRemoteHead: string;
  aheadBehind: string;
  clean: boolean;
  stagedPatchBytes: number;
  unstagedPatchBytes: number;
  untrackedFiles: number;
  ignoredFiles: number;
  bundleVerified: true;
}

async function runCommand(
  command: string,
  args: string[],
  cwd?: string,
  env?: Record<string, string | undefined>,
): Promise<CommandResult> {
  const options = {
    ...(cwd ? { cwd } : {}),
    ...(env ? { env } : {}),
    stdout: "pipe" as const,
    stderr: "pipe" as const,
  };
  const child = Bun.spawn([command, ...args], options);
  const [exitCode, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).bytes(),
    new Response(child.stderr).bytes(),
  ]);
  if (exitCode !== 0) {
    throw new Error(`${command} ${args[0] ?? ""} failed with exit ${exitCode}`);
  }
  return { stdout, stderr };
}

function text(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes).trim();
}

async function sha256(path: string): Promise<string> {
  const hasher = new Bun.CryptoHasher("sha256");
  for await (const chunk of Bun.file(path).stream()) {
    hasher.update(chunk);
  }
  return hasher.digest("hex");
}

function nullDelimitedCount(bytes: Uint8Array): number {
  let count = 0;
  for (const byte of bytes) {
    if (byte === 0) count += 1;
  }
  return count;
}

function bytesEqual(left: Uint8Array, right: Uint8Array): boolean {
  if (left.length !== right.length) return false;
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) return false;
  }
  return true;
}

function gitRemoteEnvironment():
  Record<string, string | undefined> | undefined {
  const token = process.env["GIT_SYNC_TOKEN"];
  if (!token) return undefined;
  const currentCount = Number(process.env["GIT_CONFIG_COUNT"] ?? 0);
  const index =
    Number.isSafeInteger(currentCount) && currentCount >= 0 ? currentCount : 0;
  return {
    ...process.env,
    GIT_CONFIG_COUNT: String(index + 1),
    [`GIT_CONFIG_KEY_${index}`]: "http.extraHeader",
    [`GIT_CONFIG_VALUE_${index}`]: `AUTHORIZATION: basic ${Buffer.from(`x-access-token:${token}`).toString("base64")}`,
  };
}

async function quickCheck(
  path: string,
  driver: QuickCheckDriver,
): Promise<string> {
  if (driver === "bun") {
    const database = new Database(path, { readonly: true });
    try {
      const result: unknown = database.query("PRAGMA quick_check").get();
      const row = isPlainRecord(result) ? result : null;
      return String(row?.["quick_check"] ?? row?.["0"] ?? "");
    } finally {
      database.close(false);
    }
  }

  const moduleName = "@libsql/client";
  // Annotated rather than asserted: a dynamic import of an optional dependency
  // resolves to `any`, so naming the slice this script uses is a checked
  // assignment instead of a claim about the whole module.
  const libsql: LibsqlModule = await import(moduleName);
  const client = libsql.createClient({ url: `file:${path}` });
  try {
    const result = await client.execute("PRAGMA quick_check");
    return String(result.rows[0]?.["quick_check"] ?? result.rows[0]?.[0] ?? "");
  } finally {
    client.close();
  }
}

function vectorDigestDatabase(database: Database): {
  counts: Record<string, number>;
  sha256: string;
} {
  const hasher = new Bun.CryptoHasher("sha256");
  const tables = [
    ["embeddings", "entity_id, entity_type"],
    ["embeddings_embedding_idx_shadow", "index_key"],
    ["libsql_vector_meta_shadow", "name"],
  ] as const;
  const counts: Record<string, number> = {};
  for (const [table, order] of tables) {
    hasher.update(`table:${table}\n`);
    const selected: unknown[] = database
      .query(`SELECT * FROM ${table} ORDER BY ${order}`)
      .all();
    const rows = selected.filter(isPlainRecord);
    counts[table] = rows.length;
    for (const row of rows) {
      for (const [key, value] of Object.entries(row)) {
        hasher.update(`${key}:`);
        if (value instanceof Uint8Array) hasher.update(value);
        else hasher.update(`${typeof value}:${String(value)}`);
        hasher.update("\0");
      }
      hasher.update("\n");
    }
  }
  return { counts, sha256: hasher.digest("hex") };
}

function vectorDigest(path: string): {
  counts: Record<string, number>;
  sha256: string;
} {
  const database = new Database(path, { readonly: true });
  try {
    return vectorDigestDatabase(database);
  } finally {
    database.close(false);
  }
}

async function captureDatabases(
  config: PredeployCaptureConfig,
): Promise<DatabaseCaptureRecord[]> {
  const captures: DatabaseCaptureRecord[] = [];

  for (const source of config.databases) {
    if (!(await Bun.file(source.source).exists())) {
      throw new Error(`Required database missing: ${source.source}`);
    }
    const destination = `${config.backupDir}/${source.name}`;
    if (await Bun.file(destination).exists()) {
      throw new Error(`Snapshot destination already exists: ${source.name}`);
    }

    const startedAt = new Date().toISOString();
    const database = new Database(source.source, { readonly: true });
    let originalVectorDigest:
      { counts: Record<string, number>; sha256: string } | undefined;
    if (source.method === "serialize") {
      if (source.logicalVector) {
        database.run("BEGIN");
        originalVectorDigest = vectorDigestDatabase(database);
      }
      const bytes = database.serialize();
      if (source.logicalVector) database.run("COMMIT");
      database.close(false);
      await Bun.write(destination, bytes);
    } else {
      const escapedDestination = destination.replaceAll("'", "''");
      database.run(`VACUUM INTO '${escapedDestination}'`);
      database.close(false);
    }

    const check = await quickCheck(destination, source.quickCheck);
    if (check !== "ok") {
      throw new Error(`${source.name}: PRAGMA quick_check=${check}`);
    }
    if (source.logicalVector) {
      if (!originalVectorDigest) {
        throw new Error(`${source.name}: source vector digest missing`);
      }
      const snapshot = vectorDigest(destination);
      if (
        originalVectorDigest.sha256 !== snapshot.sha256 ||
        JSON.stringify(originalVectorDigest.counts) !==
          JSON.stringify(snapshot.counts)
      ) {
        throw new Error(`${source.name}: logical vector verification failed`);
      }
      await Bun.write(
        `${config.backupDir}/${source.name}.logical-verify.json`,
        `${JSON.stringify({ original: originalVectorDigest, snapshot, exact: true }, null, 2)}\n`,
      );
    }

    const file = Bun.file(destination);
    const { quickCheck: quickCheckDriver, ...sourceMetadata } = source;
    captures.push({
      ...sourceMetadata,
      status: "captured",
      required: true,
      startedAt,
      completedAt: new Date().toISOString(),
      bytes: file.size,
      sha256: await sha256(destination),
      quickCheckDriver,
      quickCheck: check,
    });
  }

  await Bun.write(
    `${config.backupDir}/database-captures.json`,
    `${JSON.stringify(captures, null, 2)}\n`,
  );
  return captures;
}

async function captureGitCheckout(
  contentRoot: string,
  backupDir: string,
): Promise<GitCaptureRecord> {
  const git = async (args: string[]): Promise<CommandResult> =>
    runCommand("git", args, contentRoot);
  const head = text((await git(["rev-parse", "HEAD"])).stdout);
  const tree = text((await git(["rev-parse", "HEAD^{tree}"])).stdout);
  const branch = text((await git(["branch", "--show-current"])).stdout);
  const upstream = text(
    (await git(["rev-parse", "--abbrev-ref", "@{upstream}"])).stdout,
  );
  const remoteBranch = upstream.replace(/^[^/]+\//, "");
  if (!remoteBranch) throw new Error("Content checkout has no remote branch");
  const observedRemote = text(
    (
      await runCommand(
        "git",
        ["ls-remote", "origin", `refs/heads/${remoteBranch}`],
        contentRoot,
        gitRemoteEnvironment(),
      )
    ).stdout,
  ).split(/\s+/)[0];
  if (!observedRemote) throw new Error("Content remote head is unavailable");
  const aheadBehind = text(
    (await git(["rev-list", "--left-right", "--count", `HEAD...${upstream}`]))
      .stdout,
  );
  const status = await git([
    "status",
    "--porcelain=v1",
    "--branch",
    "--untracked-files=all",
  ]);
  const dirtyStatus = await git([
    "status",
    "--porcelain=v1",
    "--untracked-files=all",
  ]);
  const staged = await git(["diff", "--cached", "--binary", "--full-index"]);
  const unstaged = await git(["diff", "--binary", "--full-index"]);
  const untracked = await git([
    "ls-files",
    "--others",
    "--exclude-standard",
    "-z",
  ]);
  const ignored = await git([
    "ls-files",
    "--others",
    "--ignored",
    "--exclude-standard",
    "-z",
  ]);
  const refs = await git(["show-ref"]);

  await Promise.all([
    Bun.write(`${backupDir}/content-status.txt`, status.stdout),
    Bun.write(`${backupDir}/content-staged.patch`, staged.stdout),
    Bun.write(`${backupDir}/content-unstaged.patch`, unstaged.stdout),
    Bun.write(`${backupDir}/content-untracked.zlist`, untracked.stdout),
    Bun.write(`${backupDir}/content-ignored.zlist`, ignored.stdout),
    Bun.write(`${backupDir}/content-head.txt`, `${head}\n`),
    Bun.write(`${backupDir}/content-tree.txt`, `${tree}\n`),
    Bun.write(
      `${backupDir}/content-observed-remote.txt`,
      `${observedRemote}\n`,
    ),
    Bun.write(`${backupDir}/content-ahead-behind.txt`, `${aheadBehind}\n`),
  ]);

  await git(["bundle", "create", `${backupDir}/content.bundle`, "--all"]);
  const bundleVerify = await git([
    "bundle",
    "verify",
    `${backupDir}/content.bundle`,
  ]);
  await Bun.write(
    `${backupDir}/content-bundle-verify.txt`,
    `${new TextDecoder().decode(bundleVerify.stdout)}${new TextDecoder().decode(bundleVerify.stderr)}`,
  );
  await Bun.write(`${backupDir}/content-refs.txt`, refs.stdout);

  for (const [listName, archiveName] of [
    ["content-untracked.zlist", "content-untracked.tar"],
    ["content-ignored.zlist", "content-ignored.tar"],
  ] as const) {
    const archivePath = `${backupDir}/${archiveName}`;
    await runCommand("tar", [
      "--null",
      "--no-recursion",
      "-C",
      contentRoot,
      "-cf",
      archivePath,
      `--files-from=${backupDir}/${listName}`,
    ]);
    await runCommand("tar", [
      "--compare",
      `--file=${archivePath}`,
      "-C",
      contentRoot,
    ]);
  }

  const [
    postHead,
    postStatus,
    postStaged,
    postUnstaged,
    postUntracked,
    postIgnored,
    postRefs,
  ] = await Promise.all([
    git(["rev-parse", "HEAD"]),
    git(["status", "--porcelain=v1", "--branch", "--untracked-files=all"]),
    git(["diff", "--cached", "--binary", "--full-index"]),
    git(["diff", "--binary", "--full-index"]),
    git(["ls-files", "--others", "--exclude-standard", "-z"]),
    git(["ls-files", "--others", "--ignored", "--exclude-standard", "-z"]),
    git(["show-ref"]),
  ]);
  const stable =
    text(postHead.stdout) === head &&
    bytesEqual(postStatus.stdout, status.stdout) &&
    bytesEqual(postStaged.stdout, staged.stdout) &&
    bytesEqual(postUnstaged.stdout, unstaged.stdout) &&
    bytesEqual(postUntracked.stdout, untracked.stdout) &&
    bytesEqual(postIgnored.stdout, ignored.stdout) &&
    bytesEqual(postRefs.stdout, refs.stdout);
  if (!stable) {
    throw new Error("Content checkout changed during snapshot capture");
  }

  return {
    head,
    tree,
    branch,
    upstream,
    observedRemoteHead: observedRemote,
    aheadBehind,
    clean: dirtyStatus.stdout.length === 0,
    stagedPatchBytes: staged.stdout.length,
    unstagedPatchBytes: unstaged.stdout.length,
    untrackedFiles: nullDelimitedCount(untracked.stdout),
    ignoredFiles: nullDelimitedCount(ignored.stdout),
    bundleVerified: true,
  };
}

export async function capturePredeployBackup(
  config: PredeployCaptureConfig,
): Promise<void> {
  const databases = await captureDatabases(config);
  const git = await captureGitCheckout(config.contentRoot, config.backupDir);
  const manifest = {
    schemaVersion: 1,
    outcome: "verified",
    ...config.metadata,
    completedAt: new Date().toISOString(),
    databases,
    git,
  };
  await Bun.write(
    `${config.backupDir}/manifest.json`,
    `${JSON.stringify(manifest, null, 2)}\n`,
  );
}

function captureConfigFromEnvironment(): PredeployCaptureConfig {
  const value = (name: string): string => {
    const result = process.env[name];
    if (!result) throw new Error(`Missing ${name}`);
    return result;
  };
  return {
    backupDir: value("BACKUP_DIR"),
    contentRoot: "/app/brain-data",
    databases: [
      {
        source: "/data/brain.db",
        name: "brain.db",
        method: "vacuum",
        quickCheck: "bun",
        logicalVector: false,
      },
      {
        source: "/data/brain-jobs.db",
        name: "brain-jobs.db",
        method: "vacuum",
        quickCheck: "bun",
        logicalVector: false,
      },
      {
        source: "/data/conversations.db",
        name: "conversations.db",
        method: "vacuum",
        quickCheck: "bun",
        logicalVector: false,
      },
      {
        source: "/data/embeddings.db",
        name: "embeddings.db",
        method: "serialize",
        quickCheck: "libsql",
        logicalVector: true,
      },
      {
        source: "/data/runtime-state.db",
        name: "runtime-state.db",
        method: "vacuum",
        quickCheck: "bun",
        logicalVector: false,
      },
      {
        source: "/app/data/auth/auth.db",
        name: "auth.db",
        method: "vacuum",
        quickCheck: "bun",
        logicalVector: false,
      },
    ],
    metadata: {
      snapshotId: value("SNAPSHOT_ID"),
      targetHandle: value("TARGET_HANDLE"),
      host: value("HOST_IDENTIFIER"),
      startedAt: value("STARTED_AT"),
      sourceVersion: value("SOURCE_VERSION"),
      targetVersion: value("TARGET_VERSION"),
      toolVersion: value("TOOL_VERSION"),
      containerId: value("CONTAINER_ID"),
      imageId: value("SOURCE_IMAGE_ID"),
      imageDigest: value("SOURCE_IMAGE_DIGEST"),
    },
  };
}

function shellSafe(value: string, name: string): string {
  if (!/^[A-Za-z0-9._-]+$/.test(value)) {
    throw new Error(`${name} contains unsupported characters`);
  }
  return value;
}

export function renderPredeployBackupRemoteScript(options?: {
  captureProgramBase64?: string;
}): string {
  const captureProgramBase64 =
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
CAPTURE_PROGRAM_BASE64="${captureProgramBase64}"
state_root="/opt/brain-state"
runtime_root="/opt/brain-runtime"
content_root="/opt/brain-data"
backup_root="\${state_root}/backups"

mapfile -t containers < <(docker ps --filter "label=service=\${SERVICE_NAME}" --filter label=role=web --format '{{.ID}}')
if [ "\${#containers[@]}" -gt 1 ]; then
  echo "pre-deploy snapshot: ambiguous runtime" >&2
  exit 1
fi
if [ "\${#containers[@]}" -eq 0 ]; then
  has_state=false
  for path in "$state_root" "$runtime_root" "$content_root" /opt/brain.yaml /opt/brain-dist; do
    if [ -f "$path" ] || { [ -d "$path" ] && find "$path" -mindepth 1 -print -quit 2>/dev/null | grep -q .; }; then
      has_state=true
      break
    fi
  done
  if [ "$has_state" = true ]; then
    echo "pre-deploy snapshot: persistent state exists without an identifiable runtime" >&2
    exit 1
  fi
  echo "pre-deploy snapshot: not applicable (new server)"
  exit 0
fi
container="\${containers[0]}"
status="$(docker inspect "$container" --format '{{.State.Status}}')"
health="$(docker inspect "$container" --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}')"
if [ "$status" != running ] || [ "$health" != healthy ]; then
  echo "pre-deploy snapshot: current runtime is not healthy" >&2
  exit 1
fi

docker exec "$container" bun -e '
const response = await fetch("http://127.0.0.1:8080/health/ready");
const health = await response.json();
const queue = health.resources?.queue;
if (response.status !== 200 || health.status !== "ready" || health.operationalStatus !== "operational") process.exit(1);
if (queue && (queue.totals?.pending !== 0 || queue.totals?.processing !== 0 || queue.staleLeaseCount !== 0)) process.exit(1);
'

required_databases=(
  "$state_root/brain.db"
  "$state_root/brain-jobs.db"
  "$state_root/conversations.db"
  "$state_root/embeddings.db"
  "$state_root/runtime-state.db"
  "$runtime_root/auth/auth.db"
)
for database in "\${required_databases[@]}"; do
  if [ ! -f "$database" ]; then
    echo "pre-deploy snapshot: required database missing" >&2
    exit 1
  fi
done
if [ ! -d "$content_root/.git" ]; then
  echo "pre-deploy snapshot: content checkout missing" >&2
  exit 1
fi

prune_verified() {
  local limit="$1"
  local preserve="\${2:-}"
  local candidates=()
  shopt -s nullglob
  for candidate in "$backup_root"/predeploy-"$TARGET_HANDLE"-*; do
    case "$candidate" in *.incomplete) continue ;; esac
    [ -d "$candidate" ] || continue
    [ -f "$candidate/manifest.json" ] || continue
    [ -f "$candidate/manifest.sha256" ] || continue
    grep -q '"outcome": "verified"' "$candidate/manifest.json" || continue
    candidates+=("$candidate")
  done
  shopt -u nullglob
  if [ "\${#candidates[@]}" -le "$limit" ]; then return; fi
  mapfile -t candidates < <(printf '%s\n' "\${candidates[@]}" | sort)
  local remove_count=$((\${#candidates[@]} - limit))
  for candidate in "\${candidates[@]}"; do
    [ "$remove_count" -gt 0 ] || break
    [ "$candidate" != "$preserve" ] || continue
    rm -rf -- "$candidate"
    remove_count=$((remove_count - 1))
  done
}

install -d -m 700 "$backup_root"
prune_verified "$DEFAULT_RETENTION_COUNT"
state_bytes=0
for database in "\${required_databases[@]}"; do
  state_bytes=$((state_bytes + $(stat -c %s "$database")))
done
content_bytes="$(du -sb "$content_root" | cut -f1)"
base_bytes=$((state_bytes + content_bytes))
required_bytes=$((base_bytes + base_bytes / 2 + 1073741824))
available_bytes="$(df --output=avail -B1 "$state_root" | tail -1 | tr -d ' ')"
if [ "$available_bytes" -lt "$required_bytes" ]; then
  echo "pre-deploy snapshot: insufficient disk" >&2
  exit 1
fi

started_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
stamp="$(date -u +%Y%m%dT%H%M%SZ)"
target_label="\${TARGET_VERSION:0:12}"
snapshot_id="predeploy-\${TARGET_HANDLE}-\${target_label}-\${stamp}"
incomplete="\${backup_root}/\${snapshot_id}.incomplete"
final="\${backup_root}/\${snapshot_id}"
container_backup="/data/backups/\${snapshot_id}.incomplete"
test ! -e "$incomplete"
test ! -e "$final"
install -d -m 700 "$incomplete"

source_version="$(docker exec "$container" bun -e 'const pkg = await Bun.file("/app/node_modules/@rizom/brain/package.json").json(); process.stdout.write(pkg.version)')"
source_image_id="$(docker inspect "$container" --format '{{.Image}}')"
source_image_digest="$(docker image inspect "$source_image_id" --format '{{join .RepoDigests ","}}')"
host_identifier="$(hostname)"
docker inspect "$container" --format '{{json .State}}' > "$incomplete/container-state.json"
docker inspect "$container" --format '{{json .Mounts}}' > "$incomplete/container-mounts.json"
printf '%s\n' "$container" > "$incomplete/container-id.txt"
printf '%s\n' "$source_image_id" > "$incomplete/container-image-id.txt"
printf '%s\n' "$source_image_digest" > "$incomplete/container-image-digest.txt"
cp /opt/brain.yaml "$incomplete/brain.yaml"

printf '%s' "$CAPTURE_PROGRAM_BASE64" | base64 -d | docker exec -i \
  -e BACKUP_DIR="$container_backup" \
  -e SNAPSHOT_ID="$snapshot_id" \
  -e TARGET_HANDLE="$TARGET_HANDLE" \
  -e HOST_IDENTIFIER="$host_identifier" \
  -e STARTED_AT="$started_at" \
  -e SOURCE_VERSION="$source_version" \
  -e TARGET_VERSION="$TARGET_VERSION" \
  -e TOOL_VERSION="$TOOL_VERSION" \
  -e CONTAINER_ID="$container" \
  -e SOURCE_IMAGE_ID="$source_image_id" \
  -e SOURCE_IMAGE_DIGEST="$source_image_digest" \
  "$container" bun run - --capture

chmod 600 "$incomplete"/*
(
  cd "$incomplete"
  sha256sum manifest.json > manifest-checksum.txt
  chmod 600 manifest-checksum.txt
  : > manifest.sha256
  while IFS= read -r file; do
    sha256sum "$file" >> manifest.sha256
  done < <(find . -mindepth 1 -maxdepth 1 -type f ! -name manifest.sha256 -printf '%f\n' | sort)
  chmod 600 manifest.sha256
  sha256sum --check manifest.sha256 >/dev/null
)

test "$(stat -c %a "$incomplete")" = 700
if find "$incomplete" -mindepth 1 -maxdepth 1 -type f ! -perm 600 -print -quit | grep -q .; then
  echo "pre-deploy snapshot: invalid file permissions" >&2
  exit 1
fi
mv "$incomplete" "$final"
(cd "$final" && sha256sum --check manifest.sha256 >/dev/null)
prune_verified "$DEFAULT_RETENTION_COUNT" "$final"

duration_seconds=$(( $(date -u +%s) - $(date -u -d "$started_at" +%s) ))
total_bytes="$(du -sb "$final" | cut -f1)"
echo "SNAPSHOT_ID=$snapshot_id"
echo "BACKUP=$final"
echo "SOURCE_VERSION=$source_version"
echo "TARGET_VERSION=$TARGET_VERSION"
echo "TOTAL_BYTES=$total_bytes"
echo "DURATION_SECONDS=$duration_seconds"
echo "VERIFICATION=passed"
`;
}

export function parsePredeployBackupOutput(
  output: string,
): PredeployBackupResult {
  if (output.includes("pre-deploy snapshot: not applicable (new server)")) {
    return { applicable: false };
  }
  const values = new Map<string, string>();
  for (const line of output.split(/\r?\n/)) {
    const index = line.indexOf("=");
    if (index > 0) values.set(line.slice(0, index), line.slice(index + 1));
  }
  const snapshotId = values.get("SNAPSHOT_ID");
  const backupPath = values.get("BACKUP");
  const sourceVersion = values.get("SOURCE_VERSION");
  const targetVersion = values.get("TARGET_VERSION");
  const totalBytes = Number(values.get("TOTAL_BYTES"));
  const durationSeconds = Number(values.get("DURATION_SECONDS"));
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
  ) {
    throw new Error("Incomplete predeploy backup result");
  }
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

function appendWorkflowResult(result: PredeployBackupResult): void {
  const outputPath = process.env["GITHUB_OUTPUT"];
  const summaryPath = process.env["GITHUB_STEP_SUMMARY"];
  if (outputPath) {
    appendFileSync(
      outputPath,
      result.applicable
        ? `applicable=true\nsnapshot_id=${result.snapshotId}\nbackup_path=${result.backupPath}\n`
        : "applicable=false\n",
    );
  }
  if (summaryPath) {
    appendFileSync(
      summaryPath,
      result.applicable
        ? `### Verified pre-deploy snapshot\n- Snapshot: \`${result.snapshotId}\`\n- Path: \`${result.backupPath}\`\n- Bytes: \`${result.totalBytes}\`\n- Duration: \`${result.durationSeconds}s\`\n- Verification: passed\n`
        : "### Pre-deploy snapshot\nNot applicable: new server with no persistent state.\n",
    );
  }
}

export async function runPredeployBackup(): Promise<PredeployBackupResult> {
  const serverIp = shellSafe(process.env["SERVER_IP"] ?? "", "SERVER_IP");
  const targetHandle = shellSafe(
    process.env["TARGET_HANDLE"] ?? "",
    "TARGET_HANDLE",
  );
  const targetVersion = shellSafe(
    process.env["TARGET_VERSION"] ?? "",
    "TARGET_VERSION",
  );
  const serviceName = shellSafe(
    process.env["SERVICE_NAME"] ?? "",
    "SERVICE_NAME",
  );
  const sshUser = shellSafe(process.env["SSH_USER"] ?? "root", "SSH_USER");
  const retention = Number(
    process.env["PREDEPLOY_BACKUP_RETENTION_COUNT"] ??
      DEFAULT_PREDEPLOY_BACKUP_RETENTION_COUNT,
  );
  if (!Number.isInteger(retention) || retention < 1 || retention > 100) {
    throw new Error(
      "PREDEPLOY_BACKUP_RETENTION_COUNT must be between 1 and 100",
    );
  }

  const source = await Bun.file(import.meta.path).arrayBuffer();
  const remoteScript = renderPredeployBackupRemoteScript({
    captureProgramBase64: Buffer.from(source).toString("base64"),
  });
  const child = Bun.spawn(
    [
      "ssh",
      `${sshUser}@${serverIp}`,
      "bash",
      "-s",
      "--",
      targetHandle,
      targetVersion,
      serviceName,
      String(retention),
    ],
    { stdin: "pipe", stdout: "pipe", stderr: "pipe" },
  );
  await child.stdin.write(remoteScript);
  await child.stdin.end();
  const [exitCode, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  if (exitCode !== 0) {
    const diagnostic = stderr.trim().slice(0, 1000);
    throw new Error(
      `Predeploy backup failed${diagnostic ? `: ${diagnostic}` : ""}`,
    );
  }
  const result = parsePredeployBackupOutput(stdout);
  appendWorkflowResult(result);
  console.log(
    result.applicable
      ? `pre-deploy snapshot verified: ${result.snapshotId}`
      : "pre-deploy snapshot: not applicable (new server)",
  );
  return result;
}

if (import.meta.main) {
  if (process.argv.includes("--capture")) {
    await capturePredeployBackup(captureConfigFromEnvironment());
  } else {
    await runPredeployBackup();
  }
}
