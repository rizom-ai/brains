import { cp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { getErrorMessage } from "@brains/utils/error";

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
    env: options.env ?? process.env,
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
    env: options.env ?? process.env,
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
): Promise<ReadonlyMap<string, string>> {
  await mkdir(destination, { recursive: true });
  const entries: Array<readonly [string, string]> = [];
  for (const directory of packageDirectories) {
    const manifest = await readManifest(directory);
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
