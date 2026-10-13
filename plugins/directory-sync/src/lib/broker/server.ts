import { chmod, link, lstat, mkdir, mkdtemp, rm, unlink } from "fs/promises";
import { tmpdir } from "os";
import { dirname, join, resolve } from "path";
import { createId } from "@brains/utils/id";
import { sha256Hex } from "@brains/utils/hash";
import { getErrorMessage } from "@brains/utils/error";
import { deferred } from "@brains/utils/deferred";
import { Effect, Exit, Layer, Scope } from "@brains/utils/effect";
import { BunSocketServer } from "@brains/utils/effect/bun";
import { Queue, RpcServer, Stream } from "@brains/utils/effect/rpc";
import { BrokerRpcs } from "./rpc-contract";
import type {
  BrokerRpcEvent,
  BrokerRpcFailure,
  BrokerRpcStatus,
  ExecuteOperationPayload,
  RegisterCheckoutPayload,
} from "./rpc-contract";
import { brokerRpcServerProtocol } from "./rpc-server-protocol";
import { ActiveRequests } from "./active-requests";
import { canonicalCheckoutPath } from "./checkout-identity";
import type { ActivitySnapshot } from "./active-requests";
import { CheckoutOperationExecutor } from "./checkout-executor";
import { isMutatingOperation } from "./operations";
import type { GitOperationName } from "./operations";
import type { CheckoutExecutorOptions } from "./checkout-executor";
import { MAX_PAYLOAD_BYTES } from "./protocol";
import { BrokerJournal } from "./journal";
import type { AmbiguousRequest, JournalStart } from "./journal";

/**
 * The Git broker: one owner for every checkout it registers.
 *
 * The socket is a transport, not a second implementation. Ownership lives in
 * the per-checkout executor's queue, so two clients reaching this server get
 * the same operation atomicity a single in-process caller would — which is
 * the point, because web and worker are two processes.
 *
 * Credentials never cross this socket. A client declares which checkout it
 * means; the broker resolves that checkout's configuration, including any
 * authenticated remote, from its own environment.
 */

export interface GitBrokerJournal {
  readonly ambiguous: readonly AmbiguousRequest[];
  readonly evidenceComplete: boolean;
  readonly inheritedGeneration: boolean;
  recordStart(start: JournalStart): Promise<void>;
  recordSettled(requestId: string, outcome: "ok" | "error"): Promise<void>;
}

export interface GitBrokerServerOptions {
  /** Instance-owned runtime directory; never inside a checkout. */
  runtimeDir: string;
  brokerId?: string | undefined;
  /** Injected so supervision facts can be asserted without waiting. */
  now?: (() => number) | undefined;
  /** How many answered reads stay replayable; mutations are never dropped. */
  answeredWindow?: number | undefined;
  /** Durable record override for failure-boundary tests. */
  journal?: GitBrokerJournal | undefined;
  /**
   * Checkout configuration by canonical path. Resolved here rather than sent,
   * so a token never enters a protocol frame.
   */
  resolveCheckout: (
    checkoutPath: string,
  ) => CheckoutExecutorOptions | undefined;
}

/**
 * The one place this path is spelled. The supervisor hands it to every role
 * and the broker binds it, so a second derivation would be a way for owner
 * and clients to disagree about which socket is the singleton boundary.
 */
/** Linux allows 108 bytes including the terminating NUL. */
const MAX_UNIX_SOCKET_PATH = 107;

/**
 * The instance-owned runtime directory: journal, and the socket when it fits.
 * Derived here for the supervisor and the broker child alike; it is never
 * inside a checkout, which the supervisor verifies against the sync path.
 */
export function gitBrokerRuntimeDir(cwd: string): string {
  return join(cwd, ".brain-runtime");
}

export function gitBrokerSocketPath(runtimeDir: string): string {
  const instanceSocket = join(runtimeDir, "git-broker.sock");
  if (Buffer.byteLength(instanceSocket) <= MAX_UNIX_SOCKET_PATH) {
    return instanceSocket;
  }
  // A unix socket address is bounded and the kernel truncates rather than
  // refusing, so a deep instance directory cannot hold its own socket. The
  // address then lives in the OS temp dir, named by the instance: still one
  // socket per instance, never inside a checkout, and bound to 0600 like the
  // in-instance one.
  const instance = sha256Hex(resolve(runtimeDir)).slice(0, 24);
  return join(tmpdir(), `brain-git-broker-${instance}.sock`);
}

/**
 * How many answered *reads* stay replayable.
 *
 * Only reads are forgotten: a mutation retried after the window would run a
 * second time, which is the duplicate this ledger exists to prevent.
 */
const ANSWERED_WINDOW = 256;

type Settled = { ok: true; value: unknown } | { ok: false; error: unknown };

interface LedgerEntry {
  checkoutPath: string;
  operation: GitOperationName;
  operationIdentity: string;
  /** Mutations are never forgotten while this generation lives. */
  mutating: boolean;
  settled: Promise<Settled>;
  observers: Set<(event: BrokerRpcEvent) => void>;
  result?: Extract<BrokerRpcEvent, { _tag: "Result" }>;
}

function operationIdentity(message: ExecuteOperationPayload): string {
  return JSON.stringify(message.operation);
}

export class BrokerStartupError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BrokerStartupError";
  }
}

/** True when something already answers on this socket path. */
async function socketIsLive(socketPath: string): Promise<boolean> {
  try {
    const probe = await Bun.connect({
      unix: socketPath,
      socket: { data: (): void => {} },
    });
    probe.end();
    return true;
  } catch {
    // A liveness probe: failing to connect is the answer, not an error.
    return false;
  }
}

export class GitBrokerServer {
  readonly socketPath: string;
  readonly brokerId: string;

  readonly #executors = new Map<string, CheckoutOperationExecutor>();
  /** Request id to when that operation last showed it was still moving. */
  readonly #active = new ActiveRequests();
  readonly #resolveCheckout: GitBrokerServerOptions["resolveCheckout"];
  readonly #now: () => number;
  /**
   * Every request this generation has been asked to run, by id.
   *
   * A request id is a promise that the work happens once, so the entry is
   * created before the work starts: a duplicate that arrives while the first
   * is still running joins it instead of starting a second commit.
   */
  readonly #ledger = new Map<string, LedgerEntry>();
  readonly #answeredWindow: number;
  /**
   * Whether this owner will run work that changes the checkout.
   *
   * A replacement inherits a checkout nobody has accounted for, so it
   * starts closed and a role opens it after reconciling. An owner whose
   * predecessor left a whole record with nothing outstanding has nothing
   * to reconcile, and waiting there would be cost without safety.
   */
  #admitsMutations: boolean;
  #recoveryPending: boolean;
  readonly #journal: GitBrokerJournal | null;
  readonly #scope = Effect.runSync(Scope.make());
  #socketIdentity: { dev: number; ino: number } | undefined;
  #stopping: Promise<void> | undefined;

  private constructor(
    socketPath: string,
    brokerId: string,
    resolveCheckout: GitBrokerServerOptions["resolveCheckout"],
    now: () => number,
    journal: GitBrokerJournal | null,
    answeredWindow: number,
  ) {
    this.socketPath = socketPath;
    this.brokerId = brokerId;
    this.#resolveCheckout = resolveCheckout;
    this.#now = now;
    this.#journal = journal;
    this.#answeredWindow = answeredWindow;
    // A settled broker record proves only that Git returned to the broker. It
    // cannot prove the role received that answer and advanced its durable
    // checkpoint, so every inherited generation reconciles before mutation.
    this.#recoveryPending = journal?.inheritedGeneration ?? false;
    this.#admitsMutations = !this.#recoveryPending;
  }

  /** Reconciliation is complete; this owner may change the checkout again. */
  openAdmission(): void {
    this.#recoveryPending = false;
    this.#admitsMutations = true;
  }

  /** A durable-boundary or supervisor failure makes mutation unsafe. */
  closeAdmission(): void {
    this.#recoveryPending = true;
    this.#admitsMutations = false;
  }

  /**
   * What the previous generation was running and never finished.
   *
   * Reported, not resolved: a mutation left ambiguous by a replacement is
   * never re-executed from intent, because only the repository knows
   * whether it landed.
   */
  get ambiguousRequests(): readonly AmbiguousRequest[] {
    return this.#journal?.ambiguous ?? [];
  }

  /**
   * What supervision reads to tell a wedged owner from a busy one.
   *
   * A wedged broker does not exit, so there is no process event to wait for.
   * These are the durable facts instead.
   */
  /**
   * What supervision reads to tell a wedged owner from a busy one.
   *
   * A wedged broker does not exit, so there is no process event to wait
   * for. These are the durable facts instead — and they separate the one
   * request holding the checkout from those still waiting for it, because
   * a queue that is waiting is not a broker that is stuck.
   */
  get activity(): ActivitySnapshot {
    return this.#active.snapshot();
  }

  static async start(
    options: GitBrokerServerOptions,
  ): Promise<GitBrokerServer> {
    await mkdir(options.runtimeDir, { recursive: true, mode: 0o700 });
    await chmod(options.runtimeDir, 0o700);
    const socketPath = gitBrokerSocketPath(options.runtimeDir);

    // A stale socket is only stale if nothing answers. Unlinking without
    // probing would let a second broker evict a live owner, which is exactly
    // the one-owner invariant this design exists to hold.
    const staleSocket = await lstat(socketPath).catch(() => undefined);
    if (await socketIsLive(socketPath)) {
      throw new BrokerStartupError(
        `A live Git broker already owns ${socketPath}`,
      );
    }
    if (staleSocket) {
      const current = await lstat(socketPath).catch(() => undefined);
      if (
        current &&
        (current.dev !== staleSocket.dev || current.ino !== staleSocket.ino)
      ) {
        throw new BrokerStartupError(
          `Git broker socket ownership changed at ${socketPath}`,
        );
      }
      if (current) await unlink(socketPath);
    }

    const broker = new GitBrokerServer(
      socketPath,
      options.brokerId ?? createId(10),
      options.resolveCheckout,
      options.now ?? Date.now,
      options.journal ??
        (await BrokerJournal.open(options.runtimeDir, {
          ...(options.now ? { now: options.now } : {}),
        })),
      options.answeredWindow ?? ANSWERED_WINDOW,
    );
    try {
      await broker.#listen();
      return broker;
    } catch (error) {
      await broker.stop();
      throw error;
    }
  }

  stop(): Promise<void> {
    if (this.#stopping) return this.#stopping;
    this.closeAdmission();
    this.#stopping = this.#stopTransport();
    return this.#stopping;
  }

  async #stopTransport(): Promise<void> {
    // RPC observation ends here. Git/journal Promises remain owned by this
    // process; safe replacement still requires the process group to exit.
    await Effect.runPromise(Scope.close(this.#scope, Exit.void));
    const current = await lstat(this.socketPath).catch(() => undefined);
    if (
      current &&
      this.#socketIdentity?.dev === current.dev &&
      this.#socketIdentity.ino === current.ino
    ) {
      await unlink(this.socketPath);
    }
  }

  get registeredCheckouts(): string[] {
    return [...this.#executors.keys()].sort();
  }

  async #listen(): Promise<void> {
    // Node's socket finalizer unlinks its bind path without checking identity.
    // Bind a private generation, then atomically publish a hard link. Native
    // cleanup cannot delete a later owner's public socket. The short private
    // path also fits whenever the canonical Unix socket address fits.
    const privateDirectory = await Effect.runPromise(
      Effect.acquireRelease(
        Effect.promise(() => mkdtemp(join(dirname(this.socketPath), ".g"))),
        (directory) =>
          Effect.promise(() => rm(directory, { recursive: true, force: true })),
      ).pipe(Scope.provide(this.#scope)),
    );
    const privateSocket = join(privateDirectory, "s");
    const handlers = BrokerRpcs.toLayer({
      RegisterCheckout: (payload) =>
        Effect.tryPromise({
          try: async () => {
            await this.#register(payload);
            return this.#status();
          },
          catch: (error): BrokerRpcFailure => ({
            _tag: "BrokerError",
            message: getErrorMessage(error),
          }),
        }),
      QueryStatus: () => Effect.sync(() => this.#status()),
      OpenAdmission: () =>
        Effect.sync(() => {
          this.openAdmission();
          return this.#status();
        }),
      ExecuteOperation: (payload) => this.#observe(payload),
    });
    const transport = brokerRpcServerProtocol.pipe(
      Layer.provide(BunSocketServer.layer({ path: privateSocket })),
    );
    await Effect.runPromise(
      Layer.buildWithScope(
        RpcServer.layer(BrokerRpcs, { disableTracing: true }).pipe(
          Layer.provide(handlers),
          Layer.provide(transport),
        ),
        this.#scope,
      ),
    );
    await chmod(privateSocket, 0o600);
    const identity = await lstat(privateSocket);
    await link(privateSocket, this.socketPath);
    this.#socketIdentity = identity;
  }

  #status(): BrokerRpcStatus {
    return {
      brokerId: this.brokerId,
      checkouts: this.registeredCheckouts,
      ...this.activity,
      ambiguousRequestIds: this.ambiguousRequests.map(
        (request) => request.requestId,
      ),
      evidenceComplete: this.#journal?.evidenceComplete ?? true,
      recoveryPending: this.#recoveryPending,
      admitsMutations: this.#admitsMutations,
    };
  }

  async #register(message: RegisterCheckoutPayload): Promise<void> {
    // Physical identity: a role reaching this checkout through a symlink
    // means the same working tree, and refusing it would leave that role
    // with no owner for a checkout that already has one.
    const checkoutPath = await canonicalCheckoutPath(message.checkoutPath);
    const existing = this.#executors.get(checkoutPath);
    const configured = this.#resolveCheckout(checkoutPath);

    if (!configured) {
      throw new Error(`This broker owns no checkout at ${checkoutPath}`);
    }
    if (
      configured.branch !== message.branch ||
      configured.remoteFingerprint !== message.remoteFingerprint
    ) {
      // Identity drift would silently move ownership to a different
      // repository while every client believed it shared one owner.
      throw new Error(
        `Checkout ${checkoutPath} is registered with a different branch or remote identity`,
      );
    }
    if (existing) return;

    this.#executors.set(
      checkoutPath,
      new CheckoutOperationExecutor(configured),
    );
  }

  #observe(
    message: ExecuteOperationPayload,
  ): Stream.Stream<BrokerRpcEvent, BrokerRpcFailure> {
    return Stream.callback<BrokerRpcEvent, BrokerRpcFailure>(
      (queue) =>
        Effect.gen({ self: this }, function* () {
          const entry = yield* Effect.try({
            try: () => this.#admit(message),
            catch: (error): BrokerRpcFailure => ({
              _tag: "BrokerError",
              message: getErrorMessage(error),
            }),
          });
          const observe = (event: BrokerRpcEvent): void => {
            if (!Queue.offerUnsafe(queue, event)) {
              entry.observers.delete(observe);
              // A sliding queue only refuses after observation is closed.
              return;
            }
            if (event._tag === "Result") Queue.endUnsafe(queue);
          };
          if (entry.result) observe(entry.result);
          else entry.observers.add(observe);
          yield* Effect.addFinalizer(() =>
            Effect.sync(() => {
              entry.observers.delete(observe);
            }),
          );
        }).pipe(
          Effect.catchCause((cause) =>
            Effect.sync(() => {
              // Stream.callback does not forward producer failures into its queue.
              Queue.failCauseUnsafe(queue, cause);
            }),
          ),
        ),
      // Progress is a heartbeat, not an event log. Coalesce old progress
      // under backpressure so a healthy burst cannot hide its terminal result.
      { bufferSize: 2, strategy: "sliding" },
    );
  }

  #admit(message: ExecuteOperationPayload): LedgerEntry {
    const existing = this.#ledger.get(message.operationId);
    if (existing) {
      if (
        existing.checkoutPath !== message.checkoutPath ||
        existing.operationIdentity !== operationIdentity(message)
      ) {
        throw new Error(
          `Request ${message.operationId} is already used for ${existing.operation} on ${existing.checkoutPath}`,
        );
      }
      return existing;
    }
    if (this.#stopping) throw new Error("Git broker is stopping");
    if (!this.#admitsMutations && isMutatingOperation(message.operation)) {
      throw new Error(
        "Git admission is closed while the previous owner's work is reconciled",
      );
    }
    const completion = deferred<Settled>();
    const entry: LedgerEntry = {
      checkoutPath: message.checkoutPath,
      operation: message.operation.name,
      operationIdentity: operationIdentity(message),
      mutating: isMutatingOperation(message.operation),
      settled: completion.promise,
      observers: new Set(),
    };
    // Publish before canonicalization, adapter invocation, or any async yield.
    // Neither an RPC request fiber nor its observer owns this Promise.
    this.#ledger.set(message.operationId, entry);
    void this.#runOwned(message, entry).then((settled) => {
      entry.result = settled.ok
        ? { _tag: "Result", outcome: "ok", value: settled.value, error: null }
        : {
            _tag: "Result",
            outcome: "error",
            value: null,
            error: getErrorMessage(settled.error),
          };
      for (const observe of entry.observers) observe(entry.result);
      entry.observers.clear();
      completion.resolve(settled);
      this.#forget();
    });
    return entry;
  }

  async #runOwned(
    message: ExecuteOperationPayload,
    entry: LedgerEntry,
  ): Promise<Settled> {
    try {
      const executor = this.#executors.get(
        await canonicalCheckoutPath(message.checkoutPath),
      );
      if (!executor)
        throw new Error(`Checkout ${message.checkoutPath} is not registered`);
      return await this.#run(message, executor, (event) => {
        for (const observe of entry.observers) observe(event);
      });
    } catch (error) {
      return { ok: false, error };
    }
  }

  async #run(
    message: ExecuteOperationPayload,
    executor: CheckoutOperationExecutor,
    progress: (event: BrokerRpcEvent) => void,
  ): Promise<Settled> {
    // Accepted, not started: it may sit behind another operation, and that
    // wait must not read as this broker failing to make progress.
    this.#active.accept(message.operationId, message.checkoutPath, this.#now());

    try {
      try {
        await this.#journal?.recordStart({
          requestId: message.operationId,
          checkoutPath: message.checkoutPath,
          operation: message.operation.name,
        });
      } catch (error) {
        // Nothing may execute unless ownership is durable. More importantly,
        // the correlated error keeps the caller from waiting forever on a
        // request the broker silently abandoned.
        this.closeAdmission();
        return {
          ok: false,
          error: new Error(
            `Git broker journal start failed; mutation admission is closed: ${getErrorMessage(error)}`,
          ),
        };
      }

      let settled: Settled;
      try {
        const value = await executor.execute(message.operation, {
          onStart: (): void => {
            this.#active.start(message.operationId, this.#now());
            progress({
              _tag: "Progress",
              phase: "running",
              observedAt: new Date().toISOString(),
            });
          },
          // Keeps the caller's operation-status heartbeat fresh through a long
          // clone or pull; without it a healthy slow operation looks stalled.
          onProgress: (): void => {
            this.#active.progress(message.operationId, this.#now());
            progress({
              _tag: "Progress",
              phase: "running",
              observedAt: new Date().toISOString(),
            });
          },
        });
        // Checked before it is recorded. An oversized answer used to be
        // remembered first and found unsendable second, which left a stored
        // value that every retry re-derived and re-failed on.
        const json = JSON.stringify(value ?? null);
        const encoded = Buffer.byteLength(json);
        if (encoded > MAX_PAYLOAD_BYTES) {
          throw new Error(
            `Operation ${message.operation.name} produced ${encoded} bytes; the limit is ${MAX_PAYLOAD_BYTES}`,
          );
        }
        // Match the actual JSON wire value before Effect's JSON codec sees it;
        // adapter objects may contain optional properties set to undefined.
        const wireValue: unknown = JSON.parse(json);
        settled = { ok: true, value: wireValue };
      } catch (error) {
        // Terminal for this id. A caller that wants another attempt asks with
        // a new one: whether this attempt mutated is not knowable from here.
        settled = { ok: false, error };
      }

      try {
        await this.#journal?.recordSettled(
          message.operationId,
          settled.ok ? "ok" : "error",
        );
      } catch (error) {
        // Git may already have changed the checkout. Without a durable settle
        // record its outcome is ambiguous, so fail closed and make that fact a
        // terminal correlated answer rather than losing completion again.
        this.closeAdmission();
        return {
          ok: false,
          error: new Error(
            `Git broker journal settled write failed; mutation admission is closed: ${getErrorMessage(error)}`,
          ),
        };
      }

      return settled;
    } finally {
      this.#active.finish(message.operationId);
    }
  }

  /**
   * Forget answered reads once the window has rolled past them.
   *
   * Mutations are kept for the whole generation. A retry can arrive late, and
   * forgetting a commit because reads happened since is indistinguishable —
   * from the client's side — from never having run it.
   */
  #forget(): void {
    const forgettable = [...this.#ledger.entries()].filter(
      ([, entry]) => !entry.mutating && entry.result !== undefined,
    );
    for (const [requestId] of forgettable.slice(
      0,
      Math.max(0, forgettable.length - this.#answeredWindow),
    )) {
      this.#ledger.delete(requestId);
    }
  }
}
