import { chmod, mkdir } from "fs/promises";
import { join } from "path";
import { SerialQueue } from "@brains/utils/serial-queue";
import { BrokerJournal } from "./journal";
import type { TerminalRequestRecord } from "./journal";
import { BrokerRequestLedger } from "./ledger";
import { assertExecutableArgs } from "./protocol";
import type {
  ExecuteMessage,
  RegisterCheckoutMessage,
  StatusMessage,
} from "./protocol";
import { BROKER_PROTOCOL_VERSION } from "./protocol";
import { CheckoutRegistry } from "./registry";
import type { CheckoutRegistryOptions } from "./registry";
import {
  clearWrapperArtifacts,
  materializeWrapper,
  readWrapperActive,
  readWrapperOutput,
  readWrapperTerminal,
  spawnWrapper,
} from "./wrapper";
import type { WrapperActiveState, WrapperTerminalState } from "./wrapper";
import { createId } from "@brains/utils/id";

/**
 * Git execution for a set of checkouts.
 *
 * Every safety property lives here and in the wrapper: the advisory lock, the
 * process group, bounded output, the atomic terminal record, and the fact that
 * no child completion is ever awaited. The Unix socket in `server.ts` is a
 * transport for reaching this core from another process — not a second path
 * with its own guarantees. A process that holds an executor directly gets
 * exactly the same behaviour as one that talks to a broker.
 */

const DEFAULT_OBSERVE_MS = 25;
const DEFAULT_TIMEOUT_MS = 120_000;
const DEFAULT_MAX_OUTPUT_BYTES = 1024 * 1024;

export interface GitExecutorOptions {
  /** Instance-owned runtime directory; never inside a checkout. */
  runtimeDir: string;
  brokerId?: string | undefined;
  observeIntervalMs?: number | undefined;
  /** Wrapper-side progress poll interval; the granularity of progress. */
  wrapperPollMs?: number | undefined;
  registry?: CheckoutRegistryOptions | undefined;
  /** Credentials for wrapper environments, by repository key. Never journalled. */
  credentials?:
    ((repositoryKey: string) => Readonly<Record<string, string>>) | undefined;
  /** Binary resolution, injected so the dependency check is testable. */
  which?: ((name: string) => string | null) | undefined;
}

/**
 * Binaries `git-wrapper.sh` invokes. The wrapper is a shell script, so an image
 * missing one of these fails deep inside a Git command — an unexplained
 * non-zero exit under a held lock. Checking at startup turns that into a named
 * error before any checkout is touched.
 */
export const WRAPPER_DEPENDENCIES: readonly string[] = [
  "bash",
  "flock",
  "setsid",
  "timeout",
  "git",
];

export class MissingWrapperDependencyError extends Error {
  readonly missing: readonly string[];

  constructor(missing: readonly string[]) {
    const plural = missing.length === 1;
    super(
      `The Git wrapper requires ${missing.join(", ")}, which ${
        plural ? "is" : "are"
      } not on PATH. The runtime image must provide ${plural ? "it" : "them"}.`,
    );
    this.name = "MissingWrapperDependencyError";
    this.missing = missing;
  }
}

/** Outcome of reconciling the journal against wrappers from a previous life. */
export interface ExecutorReconciliation {
  /** Still owned by a live wrapper holding the advisory lock. */
  owned: string[];
  /** Finished; the result was simply never acknowledged. */
  completed: string[];
  /** Wrapper died without a result. Outcome unknown; never re-executed. */
  abandoned: string[];
  /** Records too damaged to trust, moved aside. */
  quarantined: string[];
}

/** True when a process id is still present. */
function processExists(pid: number): boolean {
  if (pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/** Byte progress observed while a command is still running. */
export type ExecutionProgress = (state: WrapperActiveState) => void;

export class GitExecutor {
  readonly runtimeDir: string;
  readonly journalDir: string;
  readonly brokerId: string;

  readonly #registry: CheckoutRegistry;
  readonly #journal: BrokerJournal;
  readonly #ledger: BrokerRequestLedger;
  readonly #queues = new Map<string, SerialQueue>();
  readonly #active = new Set<string>();
  readonly #observeIntervalMs: number;
  readonly #wrapperPollMs: number | undefined;
  readonly #wrapperPath: string;
  readonly #credentials: (
    repositoryKey: string,
  ) => Readonly<Record<string, string>>;

  private constructor(init: {
    runtimeDir: string;
    journalDir: string;
    brokerId: string;
    registry: CheckoutRegistry;
    journal: BrokerJournal;
    observeIntervalMs: number;
    wrapperPollMs: number | undefined;
    wrapperPath: string;
    credentials: (repositoryKey: string) => Readonly<Record<string, string>>;
  }) {
    this.runtimeDir = init.runtimeDir;
    this.journalDir = init.journalDir;
    this.brokerId = init.brokerId;
    this.#registry = init.registry;
    this.#journal = init.journal;
    this.#ledger = new BrokerRequestLedger(init.journal);
    this.#observeIntervalMs = init.observeIntervalMs;
    this.#wrapperPollMs = init.wrapperPollMs;
    this.#wrapperPath = init.wrapperPath;
    this.#credentials = init.credentials;
  }

  static async create(options: GitExecutorOptions): Promise<GitExecutor> {
    const resolve =
      options.which ?? ((name: string): string | null => Bun.which(name));
    const missing = WRAPPER_DEPENDENCIES.filter(
      (name) => resolve(name) === null,
    );
    if (missing.length > 0) throw new MissingWrapperDependencyError(missing);

    const runtimeDir = options.runtimeDir;
    await mkdir(runtimeDir, { recursive: true, mode: 0o700 });
    await chmod(runtimeDir, 0o700);
    const journalDir = join(runtimeDir, "journal");

    return new GitExecutor({
      runtimeDir,
      journalDir,
      brokerId: options.brokerId ?? createId(10),
      registry: new CheckoutRegistry(options.registry ?? {}),
      journal: await BrokerJournal.open(journalDir),
      observeIntervalMs: options.observeIntervalMs ?? DEFAULT_OBSERVE_MS,
      wrapperPollMs: options.wrapperPollMs,
      wrapperPath: await materializeWrapper(runtimeDir),
      credentials: options.credentials ?? ((): Record<string, string> => ({})),
    });
  }

  register(message: RegisterCheckoutMessage): void {
    this.#registry.register(message);
  }

  /**
   * Reconcile the journal against the wrappers that were running when this
   * process last stopped. A request whose wrapper is still alive stays owned —
   * its advisory lock is still held and it will reach a terminal result on its
   * own. One whose wrapper finished is simply unacknowledged. One whose wrapper
   * died without writing a result has a genuinely unknown outcome: it is
   * retired, never re-executed, and the checkout's real state is re-derived by
   * the reconciliation checkpoint rather than by replaying a command that may
   * already have applied.
   */
  async reconcile(): Promise<ExecutorReconciliation> {
    const quarantined = await this.#journal.quarantineCorrupt();
    const active = await this.#journal.listActive();

    const classified = await Promise.all(
      active.map(async (record) => {
        const wrapper = await readWrapperActive(
          this.journalDir,
          record.requestId,
        );
        if (wrapper && processExists(wrapper.wrapperPid)) {
          this.#active.add(record.requestId);
          return { requestId: record.requestId, state: "owned" as const };
        }

        const terminal = await readWrapperTerminal(
          this.journalDir,
          record.requestId,
        );
        if (terminal) {
          await this.#journal.clearActive(record.requestId);
          return { requestId: record.requestId, state: "completed" as const };
        }

        await this.#journal.abandonActive(record.requestId);
        return { requestId: record.requestId, state: "abandoned" as const };
      }),
    );

    const of = (state: string): string[] =>
      classified
        .filter((entry) => entry.state === state)
        .map((entry) => entry.requestId)
        .sort();

    return {
      owned: of("owned"),
      completed: of("completed"),
      abandoned: of("abandoned"),
      quarantined,
    };
  }

  status(): StatusMessage {
    return {
      type: "status",
      version: BROKER_PROTOCOL_VERSION,
      brokerId: this.brokerId,
      repositories: this.#registry.list(),
      activeRequestIds: [...this.#active].sort(),
      oldestActiveStartedAt: null,
    };
  }

  async execute(
    request: ExecuteMessage,
    onProgress?: ExecutionProgress,
  ): Promise<TerminalRequestRecord> {
    assertExecutableArgs(request.args, request.operationClass);
    const checkout = await this.#registry.resolveForExecute(request);

    // Serialized per repository so only one wrapper is live at a time. The
    // wrapper's flock remains the authority — this queue exists so a burst of
    // requests does not become a pile of processes blocked on it.
    return this.#queueFor(request.repositoryKey).run(() =>
      this.#ledger.settle(request, (settling) =>
        this.#runThroughWrapper(settling, onProgress, {
          checkoutPath: checkout.checkoutPath,
          timeoutMs: checkout.timeoutMs || DEFAULT_TIMEOUT_MS,
          maxOutputBytes: checkout.maxOutputBytes || DEFAULT_MAX_OUTPUT_BYTES,
          repositoryKey: request.repositoryKey,
        }),
      ),
    );
  }

  #queueFor(repositoryKey: string): SerialQueue {
    const existing = this.#queues.get(repositoryKey);
    if (existing) return existing;
    const queue = new SerialQueue();
    this.#queues.set(repositoryKey, queue);
    return queue;
  }

  async #runThroughWrapper(
    request: ExecuteMessage,
    onProgress: ExecutionProgress | undefined,
    context: {
      checkoutPath: string;
      timeoutMs: number;
      maxOutputBytes: number;
      repositoryKey: string;
    },
  ): Promise<TerminalRequestRecord> {
    // A request id is executed once; clearing any earlier artifacts means a
    // re-execution cannot observe the previous run and return a stale result.
    await clearWrapperArtifacts(this.journalDir, request.requestId);

    spawnWrapper({
      requestId: request.requestId,
      journalDir: this.journalDir,
      checkout: context.checkoutPath,
      lockFile: join(this.journalDir, `${context.repositoryKey}.checkout.lock`),
      wrapperPath: this.#wrapperPath,
      args: request.args,
      timeoutMs: context.timeoutMs,
      maxOutputBytes: context.maxOutputBytes,
      pollMs: this.#wrapperPollMs,
      env: this.#credentials(context.repositoryKey),
    });

    this.#active.add(request.requestId);
    try {
      const terminal = await this.#observe(request, onProgress);
      const output = await readWrapperOutput(
        this.journalDir,
        request.requestId,
      );
      const decoder = new TextDecoder();

      return {
        requestId: request.requestId,
        outcome: terminal.outcome === "overflow" ? "timeout" : terminal.outcome,
        exitCode: terminal.exitCode,
        signal: terminal.signal,
        stdout: decoder.decode(output.stdout),
        stderr: decoder.decode(output.stderr),
        truncated: terminal.truncated,
        startedAt: terminal.startedAt,
        completedAt: terminal.completedAt,
      };
    } finally {
      this.#active.delete(request.requestId);
    }
  }

  /**
   * Watch the wrapper's durable artifacts. Recursive rather than a loop, and
   * reporting on every byte advance so the caller's heartbeat keeps ticking
   * through a long clone or pull. The wrapper child is never awaited.
   */
  async #observe(
    request: ExecuteMessage,
    onProgress: ExecutionProgress | undefined,
  ): Promise<WrapperTerminalState> {
    const step = async (
      lastStdout: number,
      lastStderr: number,
    ): Promise<WrapperTerminalState> => {
      const active = await readWrapperActive(
        this.journalDir,
        request.requestId,
      );

      if (
        active &&
        (active.stdoutBytes !== lastStdout || active.stderrBytes !== lastStderr)
      ) {
        onProgress?.(active);
      }

      const terminal = await readWrapperTerminal(
        this.journalDir,
        request.requestId,
      );
      if (terminal) return terminal;

      await Bun.sleep(this.#observeIntervalMs);
      return step(
        active?.stdoutBytes ?? lastStdout,
        active?.stderrBytes ?? lastStderr,
      );
    };

    return step(-1, -1);
  }
}
