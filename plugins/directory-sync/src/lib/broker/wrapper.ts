import { readFile } from "fs/promises";
import { join } from "path";

/**
 * TypeScript side of the OS-owned command wrapper.
 *
 * The broker starts the wrapper detached and never awaits its completion: on
 * the affected Bun runtimes a child completion can simply be lost, and the
 * whole point of this design is that no such loss can wedge or prematurely
 * release checkout ownership. Instead the broker observes the wrapper's own
 * durable artifacts — byte counters while the command runs, then one atomic
 * terminal record — which is byte-identical to how a replacement broker
 * recovers a request after a crash. Normal path and recovery path are one.
 */

export const GIT_WRAPPER_PATH: string = join(import.meta.dir, "git-wrapper.sh");

export interface WrapperConfig {
  requestId: string;
  journalDir: string;
  lockFile: string;
  checkout: string;
  args: readonly string[];
  timeoutMs?: number | undefined;
  maxOutputBytes?: number | undefined;
  pollMs?: number | undefined;
  termGraceMs?: number | undefined;
  /** Ephemeral credentials, passed through the environment and never journalled. */
  env?: Readonly<Record<string, string>> | undefined;
}

export type WrapperPhase = "starting" | "running" | "terminating";

export interface WrapperActiveState {
  requestId: string;
  wrapperPid: number;
  gitPgid: number;
  phase: WrapperPhase;
  startedAt: string;
  observedAt: string;
  stdoutBytes: number;
  stderrBytes: number;
}

export interface WrapperTerminalState {
  requestId: string;
  outcome: "exit" | "signal" | "timeout" | "overflow";
  exitCode: number | null;
  signal: string | null;
  truncated: boolean;
  stdoutBytes: number;
  stderrBytes: number;
  startedAt: string;
  completedAt: string;
}

function wrapperBase(journalDir: string, requestId: string): string {
  return join(journalDir, `wrapper-${requestId}`);
}

function parseRecord(body: string): Map<string, string> {
  return new Map(
    body
      .split("\n")
      .filter((line) => line.includes("="))
      .map((line) => {
        const separator = line.indexOf("=");
        return [line.slice(0, separator), line.slice(separator + 1)];
      }),
  );
}

async function readRecord(path: string): Promise<Map<string, string> | null> {
  const body = await readFile(path, "utf-8").catch(() => null);
  return body === null ? null : parseRecord(body);
}

function toNumber(value: string | undefined): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toPhase(value: string | undefined): WrapperPhase {
  return value === "running" || value === "terminating" ? value : "starting";
}

function toOutcome(value: string | undefined): WrapperTerminalState["outcome"] {
  if (value === "signal" || value === "timeout" || value === "overflow") {
    return value;
  }
  return "exit";
}

/**
 * Start the wrapper and return its pid. Deliberately returns a pid rather than
 * a handle: there is no completion promise to await, by design.
 */
export function spawnWrapper(config: WrapperConfig): number {
  const child = Bun.spawn([GIT_WRAPPER_PATH, ...config.args], {
    // The wrapper cd's into the checkout itself; keeping the spawn cwd
    // elsewhere means a replaced checkout cannot strand the wrapper.
    cwd: config.journalDir,
    stdin: "ignore",
    stdout: "ignore",
    stderr: "ignore",
    detached: true,
    env: {
      ...process.env,
      ...config.env,
      GIT_BROKER_REQUEST_ID: config.requestId,
      GIT_BROKER_JOURNAL_DIR: config.journalDir,
      GIT_BROKER_LOCK_FILE: config.lockFile,
      GIT_BROKER_CHECKOUT: config.checkout,
      ...(config.timeoutMs === undefined
        ? {}
        : { GIT_BROKER_TIMEOUT_MS: String(config.timeoutMs) }),
      ...(config.maxOutputBytes === undefined
        ? {}
        : { GIT_BROKER_MAX_OUTPUT_BYTES: String(config.maxOutputBytes) }),
      ...(config.pollMs === undefined
        ? {}
        : { GIT_BROKER_POLL_MS: String(config.pollMs) }),
      ...(config.termGraceMs === undefined
        ? {}
        : { GIT_BROKER_TERM_GRACE_MS: String(config.termGraceMs) }),
    },
  });

  // Never awaited: the wrapper outlives this process if it has to, and its
  // result is read from the journal rather than from a completion callback.
  child.unref();
  return child.pid;
}

export async function readWrapperActive(
  journalDir: string,
  requestId: string,
): Promise<WrapperActiveState | null> {
  const record = await readRecord(
    `${wrapperBase(journalDir, requestId)}.active`,
  );
  if (!record) return null;

  const id = record.get("request_id");
  if (id === undefined) return null;

  return {
    requestId: id,
    wrapperPid: toNumber(record.get("wrapper_pid")),
    gitPgid: toNumber(record.get("git_pgid")),
    phase: toPhase(record.get("phase")),
    startedAt: record.get("started_at") ?? "",
    observedAt: record.get("observed_at") ?? "",
    stdoutBytes: toNumber(record.get("stdout_bytes")),
    stderrBytes: toNumber(record.get("stderr_bytes")),
  };
}

export async function readWrapperTerminal(
  journalDir: string,
  requestId: string,
): Promise<WrapperTerminalState | null> {
  const record = await readRecord(
    `${wrapperBase(journalDir, requestId)}.terminal`,
  );
  if (!record) return null;

  const id = record.get("request_id");
  if (id === undefined) return null;

  const exitCode = record.get("exit_code");
  const signal = record.get("signal");

  return {
    requestId: id,
    outcome: toOutcome(record.get("outcome")),
    exitCode:
      exitCode === undefined || exitCode === "" ? null : Number(exitCode),
    signal: signal === undefined || signal === "" ? null : signal,
    truncated: record.get("truncated") === "true",
    stdoutBytes: toNumber(record.get("stdout_bytes")),
    stderrBytes: toNumber(record.get("stderr_bytes")),
    startedAt: record.get("started_at") ?? "",
    completedAt: record.get("completed_at") ?? "",
  };
}

/** Captured output, read as bytes so Git's NUL-delimited porcelain survives. */
export async function readWrapperOutput(
  journalDir: string,
  requestId: string,
): Promise<{ stdout: Uint8Array; stderr: Uint8Array }> {
  const base = wrapperBase(journalDir, requestId);
  const empty = new Uint8Array(0);
  const [stdout, stderr] = await Promise.all([
    readFile(`${base}.stdout`).catch(() => empty),
    readFile(`${base}.stderr`).catch(() => empty),
  ]);
  return { stdout, stderr };
}
