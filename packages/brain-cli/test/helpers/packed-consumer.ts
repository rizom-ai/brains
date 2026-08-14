import { afterAll } from "bun:test";
import {
  existsSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  statSync,
} from "node:fs";
import { cp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getErrorMessage } from "@brains/utils/error";
import { packedBrainTarball } from "./packed-evidence";

export {
  packedCompatibilityEvidenceEnabled,
  PACKED_BRAIN_TARBALL_ENV,
  PACKED_COMPATIBILITY_EVIDENCE_ENV,
} from "./packed-evidence";

/**
 * A temp root the harness owns, shared by every process it spawns.
 *
 * `bun install` extracts each tarball into a staging directory under the
 * spawned process's temp dir, named `.<hash>-<counter>.<last name segment>`,
 * then renames it into `node_modules`. When a packed test times out or the
 * process is killed mid-install, the rename never happens and the staging
 * directory is orphaned with nothing to reap it. `@rizom/brain` ships `dist/`
 * and `templates/`, so each orphan cost ~113MB and a few hundred of them
 * filled the disk.
 *
 * Redirecting spawned processes here does not stop bun from orphaning staging
 * directories — it makes the orphans land somewhere that gets removed.
 */
let spawnTempRoot: string | undefined;
let cleanupArmed = false;
let reaped = false;

/** Temp-directory prefixes the packed harness and its tests create. */
const PACKED_TEMP_PREFIXES = ["packed-spawn-", "public-authoring-"] as const;

/** How long a directory must be untouched before it counts as abandoned. */
const ORPHAN_AGE_MS = 60 * 60 * 1000;

export interface ReapOptions {
  /** Directory to sweep. Defaults to the system temp dir. */
  readonly root?: string;
  /** Minimum age before a directory is removed. Defaults to one hour. */
  readonly olderThanMs?: number;
}

/**
 * Remove packed-test temp directories left behind by runs that were killed.
 *
 * Both cleanup routes here — the `finally` in each packed test and the
 * `afterAll` below — need the process to survive to the end. A timeout, a
 * SIGKILL, or a full disk skips them, and each orphan is hundreds of megabytes.
 * Nothing else reaps them, so they accumulate until the disk fills, which then
 * kills the next run and orphans more. That loop is why this exists.
 *
 * Age is the safety mechanism: another suite may be running right now, and its
 * temp root is minutes old, not hours. Only directories whose names this
 * harness owns are considered, so an unrelated directory in the temp dir is
 * never touched.
 */
export function reapOrphanedPackedTempDirs(
  options: ReapOptions = {},
): string[] {
  const root = options.root ?? tmpdir();
  const olderThanMs = options.olderThanMs ?? ORPHAN_AGE_MS;
  const cutoff = Date.now() - olderThanMs;

  const ours = (name: string): boolean =>
    PACKED_TEMP_PREFIXES.some((prefix) => name.startsWith(prefix));

  // flatMap rather than a filter that deletes: the removal is the point, so it
  // reads better as a mapping to "removed" than as a predicate with a side
  // effect. Racing another reaper is expected — two suites can start together —
  // so a directory vanishing between the stat and the removal is not an error.
  return listDirectory(root)
    .filter(ours)
    .flatMap((name) => {
      const path = join(root, name);
      try {
        if (statSync(path).mtimeMs >= cutoff) return [];
        rmSync(path, { recursive: true, force: true });
        return [name];
      } catch {
        return [];
      }
    });
}

/** The entries of a directory, or none when it cannot be read. */
function listDirectory(root: string): string[] {
  try {
    return readdirSync(root);
  } catch {
    return [];
  }
}

/**
 * Create the root on first use and arm cleanup for the scope that needs it.
 *
 * It has to be `afterAll` rather than a process hook: bun's test runner fires
 * neither `exit` nor `beforeExit`. And it has to re-arm rather than register
 * once at module load: bun evaluates this module once per *process* and runs a
 * package's test files in one process, so a single registration would only
 * cover whichever file imported first. Disarming inside the hook makes the
 * next file register its own, and clearing the root makes it get a fresh one
 * instead of spawning into a directory that has already been removed.
 */
function currentSpawnTempRoot(): string {
  if (!reaped) {
    // Once per process, before staging anything of our own: clears whatever
    // previous killed runs left behind so the disk cannot fill from history.
    reaped = true;
    reapOrphanedPackedTempDirs();
  }
  spawnTempRoot ??= mkdtempSync(join(tmpdir(), "packed-spawn-"));
  if (!cleanupArmed) {
    cleanupArmed = true;
    afterAll(() => {
      cleanupArmed = false;
      removeSpawnTempRoot();
    });
  }
  return spawnTempRoot;
}

/**
 * Remove the spawn temp root and everything spawned processes staged in it.
 *
 * Runs automatically after each test file; exported so a test can force it,
 * and so this behaviour is itself testable.
 */
export function removeSpawnTempRoot(): void {
  if (spawnTempRoot === undefined) return;
  rmSync(spawnTempRoot, { recursive: true, force: true });
  spawnTempRoot = undefined;
}

/**
 * The environment every spawned process gets.
 *
 * The temp root always wins over an inherited or caller-supplied `TMPDIR`:
 * callers build their env by spreading `process.env`, so honouring what is
 * already there would send staging straight back to the shared temp dir. `TMP`
 * and `TEMP` are set alongside it because tooling disagrees about which one to
 * read.
 */
function spawnEnv(env: NodeJS.ProcessEnv | undefined): NodeJS.ProcessEnv {
  const root = currentSpawnTempRoot();
  return { ...(env ?? process.env), TMPDIR: root, TMP: root, TEMP: root };
}

export interface CommandResult {
  readonly stdout: string;
  readonly stderr: string;
}

export interface ManagedProcess {
  readonly exited: Promise<number>;
  kill(signal?: number | NodeJS.Signals): void;
}

export interface StartedCommand {
  readonly process: ManagedProcess;
  readonly completed: Promise<CommandResult & { readonly exitCode: number }>;
  waitForOutput(expected: string, timeoutMs?: number): Promise<void>;
  getOutput(): CommandResult;
}

interface HttpReadinessOptions {
  readonly timeoutMs?: number | undefined;
  readonly intervalMs?: number | undefined;
}

interface RunCommandOptions {
  readonly env?: NodeJS.ProcessEnv | undefined;
  readonly timeoutMs?: number | undefined;
}

export function startCommand(
  command: readonly string[],
  cwd: string,
  options: RunCommandOptions = {},
): StartedCommand {
  const child = Bun.spawn([...command], {
    cwd,
    env: spawnEnv(options.env),
    stdout: "pipe",
    stderr: "pipe",
  });
  let stdout = "";
  let stderr = "";
  let exitCode: number | undefined;
  const listeners = new Set<() => void>();
  const notify = (): void => {
    for (const listener of listeners) listener();
  };
  const capture = async (
    stream: ReadableStream<Uint8Array>,
    append: (chunk: string) => void,
  ): Promise<void> => {
    const decoder = new TextDecoder();
    for await (const chunk of stream) {
      append(decoder.decode(chunk, { stream: true }));
      notify();
    }
    append(decoder.decode());
    notify();
  };
  const stdoutCapture = capture(child.stdout, (chunk) => {
    stdout += chunk;
  });
  const stderrCapture = capture(child.stderr, (chunk) => {
    stderr += chunk;
  });
  const completed = Promise.all([
    child.exited,
    stdoutCapture,
    stderrCapture,
  ]).then(([code]) => {
    exitCode = code;
    notify();
    return { stdout, stderr, exitCode: code };
  });

  return {
    process: child,
    completed,
    getOutput: () => ({ stdout, stderr }),
    waitForOutput: (expected, timeoutMs = 30_000) =>
      new Promise<void>((resolve, reject) => {
        let settled = false;
        const finish = (error?: Error): void => {
          if (settled) return;
          settled = true;
          clearTimeout(timeout);
          listeners.delete(check);
          if (error) reject(error);
          else resolve();
        };
        const check = (): void => {
          if (`${stdout}\n${stderr}`.includes(expected)) {
            finish();
          } else if (exitCode !== undefined) {
            finish(
              new Error(
                `Command exited before output appeared: ${expected}\n${stdout}\n${stderr}`,
              ),
            );
          }
        };
        const timeout = setTimeout(
          () =>
            finish(
              new Error(
                `Command output timed out after ${timeoutMs}ms: ${expected}\n${stdout}\n${stderr}`,
              ),
            ),
          timeoutMs,
        );
        listeners.add(check);
        check();
      }),
  };
}

export async function runCommand(
  command: readonly string[],
  cwd: string,
  options: RunCommandOptions = {},
): Promise<CommandResult> {
  const child = Bun.spawn([...command], {
    cwd,
    env: spawnEnv(options.env),
    stdout: "pipe",
    stderr: "pipe",
  });
  const stdout = new Response(child.stdout).text();
  const stderr = new Response(child.stderr).text();
  const completed = Promise.all([child.exited, stdout, stderr]).then(
    ([exitCode, capturedStdout, capturedStderr]) => ({
      kind: "completed" as const,
      exitCode,
      stdout: capturedStdout,
      stderr: capturedStderr,
    }),
  );
  const timeoutMs = options.timeoutMs ?? 60_000;
  const timeoutController = new AbortController();
  const timeout = new Promise<{ readonly kind: "timeout" }>((resolve) => {
    timeoutController.signal.addEventListener(
      "abort",
      () => resolve({ kind: "timeout" }),
      { once: true },
    );
  });
  const timeoutHandle = setTimeout(() => timeoutController.abort(), timeoutMs);
  const outcome = await Promise.race([completed, timeout]);

  if (outcome.kind === "timeout") {
    child.kill("SIGTERM");
    const forceKill = setTimeout(() => child.kill("SIGKILL"), 2_000);
    const [, capturedStdout, capturedStderr] = await Promise.all([
      child.exited,
      stdout,
      stderr,
    ]);
    clearTimeout(forceKill);
    throw new Error(
      [
        `Command timed out: ${command.join(" ")}`,
        `Working directory: ${cwd}`,
        "--- stdout ---",
        capturedStdout,
        "--- stderr ---",
        capturedStderr,
      ].join("\n"),
    );
  }

  clearTimeout(timeoutHandle);
  if (outcome.exitCode !== 0) {
    throw new Error(
      [
        `Command failed (${outcome.exitCode}): ${command.join(" ")}`,
        `Working directory: ${cwd}`,
        "--- stdout ---",
        outcome.stdout,
        "--- stderr ---",
        outcome.stderr,
      ].join("\n"),
    );
  }
  return { stdout: outcome.stdout, stderr: outcome.stderr };
}

interface PackageManifest {
  readonly name: string;
  readonly dependencies?: Record<string, string> | undefined;
}

export type RegistryPackageVersions = Readonly<Record<string, string>>;

interface PackageManifestDocument extends Record<string, unknown> {
  readonly name: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isPackageManifestDocument(
  value: unknown,
): value is PackageManifestDocument {
  return isRecord(value) && typeof value["name"] === "string";
}

function stringRecord(value: unknown, label: string): Record<string, string> {
  if (
    !isRecord(value) ||
    !Object.values(value).every((entry) => typeof entry === "string")
  ) {
    throw new Error(`Invalid ${label} in package manifest`);
  }
  return Object.fromEntries(
    Object.entries(value).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string",
    ),
  );
}

async function readManifestDocument(
  directory: string,
): Promise<PackageManifestDocument> {
  const value: unknown = JSON.parse(
    await readFile(join(directory, "package.json"), "utf8"),
  );
  if (!isPackageManifestDocument(value)) {
    throw new Error(`Invalid package manifest: ${directory}/package.json`);
  }
  return value;
}

async function readManifest(directory: string): Promise<PackageManifest> {
  const value = await readManifestDocument(directory);
  return {
    name: value["name"],
    dependencies: stringRecord(
      value["dependencies"] ?? {},
      `dependencies: ${directory}/package.json`,
    ),
  };
}

export async function packPackages(
  packageDirectories: readonly string[],
  destination: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<ReadonlyMap<string, string>> {
  await mkdir(destination, { recursive: true });
  const entries: Array<readonly [string, string]> = [];
  for (const directory of packageDirectories) {
    const manifest = await readManifest(directory);
    const sharedBrainTarball = packedBrainTarball(env);
    if (manifest.name === "@rizom/brain" && sharedBrainTarball !== undefined) {
      if (!existsSync(sharedBrainTarball)) {
        throw new Error(
          `Shared packed @rizom/brain tarball does not exist: ${sharedBrainTarball}`,
        );
      }
      entries.push([manifest.name, sharedBrainTarball]);
      continue;
    }
    const before = new Set(await readdir(destination));
    await runCommand(
      ["bun", "pm", "pack", "--destination", destination, "--quiet"],
      directory,
    );
    const tarball = (await readdir(destination)).find(
      (entry) => !before.has(entry) && entry.endsWith(".tgz"),
    );
    if (!tarball) {
      throw new Error(`Packed tarball is missing for ${manifest.name}`);
    }
    entries.push([manifest.name, join(destination, tarball)]);
  }
  return new Map(entries);
}

export async function buildAndPackFixturePackage(
  fixtureDirectory: string,
  stagingDirectory: string,
  destination: string,
  dependencyTarballs: ReadonlyMap<string, string>,
  registryVersions: RegistryPackageVersions = {},
): Promise<readonly [string, string]> {
  const packageMetadata = await readManifest(fixtureDirectory);
  const packageDirectory = join(
    stagingDirectory,
    packageMetadata.name.replaceAll("/", "__"),
  );
  await cp(fixtureDirectory, packageDirectory, { recursive: true });

  const manifestPath = join(packageDirectory, "package.json");
  const originalManifest = await readFile(manifestPath, "utf8");
  const parsedManifest: unknown = JSON.parse(originalManifest);
  if (!isRecord(parsedManifest)) {
    throw new Error(`Invalid package manifest: ${manifestPath}`);
  }
  const dependencies = stringRecord(
    parsedManifest["dependencies"] ?? {},
    `dependencies: ${manifestPath}`,
  );
  const devDependencies = stringRecord(
    parsedManifest["devDependencies"] ?? {},
    `devDependencies: ${manifestPath}`,
  );
  const peerDependencies = stringRecord(
    parsedManifest["peerDependencies"] ?? {},
    `peerDependencies: ${manifestPath}`,
  );
  const overrides = stringRecord(
    parsedManifest["overrides"] ?? {},
    `overrides: ${manifestPath}`,
  );
  for (const [packageName, version] of Object.entries(registryVersions)) {
    overrides[packageName] = version;
    if (packageName in dependencies) dependencies[packageName] = version;
    if (packageName in peerDependencies) {
      devDependencies[packageName] = version;
    }
  }
  for (const [packageName, tarball] of dependencyTarballs) {
    const localTarball = `file:${tarball}`;
    overrides[packageName] = localTarball;
    if (packageName in dependencies) {
      dependencies[packageName] = localTarball;
    } else if (packageName in peerDependencies) {
      devDependencies[packageName] = localTarball;
    }
  }
  await writeFile(
    manifestPath,
    `${JSON.stringify(
      { ...parsedManifest, dependencies, devDependencies, overrides },
      null,
      2,
    )}\n`,
  );

  await runCommand(["bun", "install", "--ignore-scripts"], packageDirectory, {
    timeoutMs: 120_000,
  });
  await writeFile(manifestPath, originalManifest);
  await runCommand(
    ["bun", "x", "tsc", "-p", "tsconfig.json"],
    packageDirectory,
    {
      timeoutMs: 120_000,
    },
  );
  const packed = await packPackages([packageDirectory], destination);
  const tarball = packed.get(packageMetadata.name);
  if (!tarball) {
    throw new Error(`Packed tarball is missing for ${packageMetadata.name}`);
  }
  return [packageMetadata.name, tarball];
}

export async function installPackedConsumer(
  fixtureDirectory: string,
  consumerDirectory: string,
  tarballs: ReadonlyMap<string, string>,
  registryVersions: RegistryPackageVersions = {},
): Promise<void> {
  await cp(fixtureDirectory, consumerDirectory, { recursive: true });
  const manifestPath = join(consumerDirectory, "package.json");
  const manifest = await readManifestDocument(consumerDirectory);
  const dependencies = stringRecord(
    manifest["dependencies"] ?? {},
    `dependencies: ${manifestPath}`,
  );
  const overrides = stringRecord(
    manifest["overrides"] ?? {},
    `overrides: ${manifestPath}`,
  );
  for (const [packageName, version] of Object.entries(registryVersions)) {
    overrides[packageName] = version;
    if (packageName in dependencies) dependencies[packageName] = version;
  }
  for (const [packageName, tarball] of tarballs) {
    if (packageName in dependencies) {
      dependencies[packageName] = `file:${tarball}`;
    }
    overrides[packageName] = `file:${tarball}`;
  }
  await writeFile(
    manifestPath,
    `${JSON.stringify({ ...manifest, dependencies, overrides }, null, 2)}\n`,
  );

  await runCommand(
    ["bun", "install", "--ignore-scripts", "--save-text-lockfile"],
    consumerDirectory,
    { timeoutMs: 120_000 },
  );
  await rm(join(consumerDirectory, "node_modules"), {
    recursive: true,
    force: true,
  });
  await runCommand(
    ["bun", "install", "--ignore-scripts", "--frozen-lockfile"],
    consumerDirectory,
    { timeoutMs: 120_000 },
  );
}

export async function waitForHttpReadiness(
  url: string,
  options: HttpReadinessOptions = {},
): Promise<Response> {
  const timeoutMs = options.timeoutMs ?? 30_000;
  const deadline = Date.now() + timeoutMs;
  let lastDiagnostic = "no response";

  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, {
        signal: AbortSignal.timeout(
          Math.max(
            1,
            Math.min(options.intervalMs ?? 250, deadline - Date.now()),
          ),
        ),
      });
      if (response.ok) return response;
      lastDiagnostic = `HTTP ${response.status}: ${await response.text()}`;
    } catch (error) {
      lastDiagnostic = getErrorMessage(error);
    }
    await Bun.sleep(options.intervalMs ?? 250);
  }

  throw new Error(
    `HTTP readiness timed out after ${timeoutMs}ms for ${url}; last result: ${lastDiagnostic}`,
  );
}

export async function stopProcess(
  child: ManagedProcess,
  timeoutMs = 5_000,
): Promise<void> {
  child.kill("SIGTERM");
  const stopped = await Promise.race([
    child.exited.then(() => true),
    Bun.sleep(timeoutMs).then(() => false),
  ]);
  if (!stopped) {
    child.kill("SIGKILL");
    await child.exited;
  }
}

export function registryEvidenceEnabled(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return env["RIZOM_PUBLIC_API_REGISTRY_EVIDENCE"] === "1";
}

export function liveEvidenceEnabled(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return env["RIZOM_PUBLIC_API_LIVE_EVIDENCE"] === "1";
}

export function combinedOutput(result: CommandResult): string {
  return `${result.stdout}\n${result.stderr}`;
}
