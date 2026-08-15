import { chmod, mkdir, unlink } from "fs/promises";
import { join, resolve } from "path";
import { createId } from "@brains/utils/id";
import { getErrorMessage } from "@brains/utils/error";
import { CheckoutOperationExecutor } from "./checkout-executor";
import { isMutatingOperation } from "./operations";
import type { GitOperationName } from "./operations";
import type { CheckoutExecutorOptions } from "./checkout-executor";
import { BROKER_PROTOCOL_VERSION, FrameDecoder, encodeFrame } from "./protocol";
import type {
  BrokerMessage,
  ExecuteOperationMessage,
  RegisterCheckoutMessage,
} from "./protocol";
import { BrokerJournal } from "./journal";
import type { AmbiguousRequest } from "./journal";
import { SocketWriter } from "./socket-writer";
import type { WritableSocket } from "./socket-writer";

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

export interface GitBrokerServerOptions {
  /** Instance-owned runtime directory; never inside a checkout. */
  runtimeDir: string;
  brokerId?: string | undefined;
  /** Injected so supervision facts can be asserted without waiting. */
  now?: (() => number) | undefined;
  /** How many answered reads stay replayable; mutations are never dropped. */
  answeredWindow?: number | undefined;
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
export function gitBrokerSocketPath(runtimeDir: string): string {
  return join(runtimeDir, "git-broker.sock");
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
  /** Mutations are never forgotten while this generation lives. */
  mutating: boolean;
  settled: Promise<Settled>;
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
    return false;
  }
}

export class GitBrokerServer {
  readonly socketPath: string;
  readonly brokerId: string;

  readonly #executors = new Map<string, CheckoutOperationExecutor>();
  /** Request id to when that operation last showed it was still moving. */
  readonly #active = new Map<
    string,
    { checkoutPath: string; progressAt: number }
  >();
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
  readonly #journal: BrokerJournal | null;
  #server: { stop(closeActiveConnections?: boolean): void } | null = null;

  private constructor(
    socketPath: string,
    brokerId: string,
    resolveCheckout: GitBrokerServerOptions["resolveCheckout"],
    now: () => number,
    journal: BrokerJournal | null,
    answeredWindow: number,
  ) {
    this.socketPath = socketPath;
    this.brokerId = brokerId;
    this.#resolveCheckout = resolveCheckout;
    this.#now = now;
    this.#journal = journal;
    this.#answeredWindow = answeredWindow;
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
  get activity(): {
    activeRequestIds: string[];
    oldestActiveProgressAt: number | null;
  } {
    const active = [...this.#active.entries()];
    return {
      activeRequestIds: active.map(([requestId]) => requestId).sort(),
      oldestActiveProgressAt: active.length
        ? Math.min(...active.map(([, entry]) => entry.progressAt))
        : null,
    };
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
    if (await socketIsLive(socketPath)) {
      throw new BrokerStartupError(
        `A live Git broker already owns ${socketPath}`,
      );
    }
    await unlink(socketPath).catch(() => undefined);

    const broker = new GitBrokerServer(
      socketPath,
      options.brokerId ?? createId(10),
      options.resolveCheckout,
      options.now ?? Date.now,
      await BrokerJournal.open(options.runtimeDir, {
        ...(options.now ? { now: options.now } : {}),
      }),
      options.answeredWindow ?? ANSWERED_WINDOW,
    );
    await broker.#listen();
    return broker;
  }

  async stop(): Promise<void> {
    this.#server?.stop(true);
    this.#server = null;
    await unlink(this.socketPath).catch(() => undefined);
  }

  get registeredCheckouts(): string[] {
    return [...this.#executors.keys()].sort();
  }

  async #listen(): Promise<void> {
    const decoders = new WeakMap<object, FrameDecoder>();
    const writers = new WeakMap<object, SocketWriter>();

    const writerFor = (socket: WritableSocket & object): SocketWriter => {
      const existing = writers.get(socket);
      if (existing) return existing;
      const created = new SocketWriter(socket);
      writers.set(socket, created);
      return created;
    };

    this.#server = Bun.listen({
      unix: this.socketPath,
      socket: {
        open: (socket): void => {
          decoders.set(socket, new FrameDecoder());
          writerFor(socket);
        },
        drain: (socket): void => {
          writerFor(socket).flush();
        },
        data: (socket, chunk): void => {
          const decoder = decoders.get(socket) ?? new FrameDecoder();
          decoders.set(socket, decoder);
          const writer = writerFor(socket);
          const messages = ((): BrokerMessage[] => {
            try {
              return decoder.push(chunk);
            } catch (error) {
              this.#fail(writer, "req_undecodable0", error);
              return [];
            }
          })();
          messages.forEach((message) => {
            void this.#handle(writer, message);
          });
        },
      },
    });

    await chmod(this.socketPath, 0o600);
  }

  #send(writer: SocketWriter, message: BrokerMessage): void {
    writer.send(encodeFrame(message));
  }

  #fail(writer: SocketWriter, requestId: string, error: unknown): void {
    this.#send(writer, {
      type: "result",
      version: BROKER_PROTOCOL_VERSION,
      requestId,
      outcome: "error",
      value: null,
      error: getErrorMessage(error),
    });
  }

  #status(writer: SocketWriter, requestId: string): void {
    this.#send(writer, {
      type: "status",
      version: BROKER_PROTOCOL_VERSION,
      requestId,
      brokerId: this.brokerId,
      checkouts: this.registeredCheckouts,
      ...this.activity,
    });
  }

  #register(message: RegisterCheckoutMessage): void {
    const checkoutPath = resolve(message.checkoutPath);
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

  async #handle(writer: SocketWriter, message: BrokerMessage): Promise<void> {
    if (message.type === "register-checkout") {
      try {
        this.#register(message);
      } catch (error) {
        // Correlated by request id: an uncorrelated failure would leave the
        // caller waiting on a reply that never arrives, which is the silent
        // wedge this design exists to remove.
        this.#fail(writer, message.requestId, error);
        return;
      }
      this.#status(writer, message.requestId);
      return;
    }

    if (message.type === "query") {
      this.#status(writer, message.requestId);
      return;
    }

    if (message.type === "execute-operation") {
      await this.#execute(writer, message);
    }
  }

  async #execute(
    writer: SocketWriter,
    message: ExecuteOperationMessage,
  ): Promise<void> {
    const existing = this.#ledger.get(message.requestId);
    if (existing) {
      if (
        existing.checkoutPath !== message.checkoutPath ||
        existing.operation !== message.operation.name
      ) {
        // Answers are indistinguishable across operations — a commit and a
        // push both answer with nothing — so replaying one for the other
        // would report a push that never reached the remote.
        this.#fail(
          writer,
          message.requestId,
          new Error(
            `Request ${message.requestId} is already used for ${existing.operation} on ${existing.checkoutPath}`,
          ),
        );
        return;
      }
      // Either already answered, or still running and about to be.
      this.#reply(writer, message.requestId, await existing.settled);
      return;
    }

    const executor = this.#executors.get(resolve(message.checkoutPath));
    if (!executor) {
      this.#fail(
        writer,
        message.requestId,
        new Error(`Checkout ${message.checkoutPath} is not registered`),
      );
      return;
    }

    const settled = this.#run(writer, message, executor);
    this.#ledger.set(message.requestId, {
      checkoutPath: message.checkoutPath,
      operation: message.operation.name,
      mutating: isMutatingOperation(message.operation),
      settled,
    });
    this.#forget();
    this.#reply(writer, message.requestId, await settled);
  }

  async #run(
    writer: SocketWriter,
    message: ExecuteOperationMessage,
    executor: CheckoutOperationExecutor,
  ): Promise<Settled> {
    this.#active.set(message.requestId, {
      checkoutPath: message.checkoutPath,
      progressAt: this.#now(),
    });
    await this.#journal?.recordStart({
      requestId: message.requestId,
      checkoutPath: message.checkoutPath,
      operation: message.operation.name,
    });

    try {
      const value = await executor.execute(message.operation, {
        // Keeps the caller's operation-status heartbeat fresh through a long
        // clone or pull; without it a healthy slow operation looks stalled.
        onProgress: (): void => {
          const entry = this.#active.get(message.requestId);
          if (entry) entry.progressAt = this.#now();
          this.#send(writer, {
            type: "progress",
            version: BROKER_PROTOCOL_VERSION,
            requestId: message.requestId,
            phase: "running",
            observedAt: new Date().toISOString(),
          });
        },
      });
      await this.#journal?.recordSettled(message.requestId, "ok");
      return { ok: true, value: value ?? null };
    } catch (error) {
      // Terminal for this id. A caller that wants another attempt asks with
      // a new one: whether this attempt mutated is not knowable from here.
      await this.#journal?.recordSettled(message.requestId, "error");
      return { ok: false, error };
    } finally {
      this.#active.delete(message.requestId);
    }
  }

  #reply(writer: SocketWriter, requestId: string, settled: Settled): void {
    if (!settled.ok) {
      this.#fail(writer, requestId, settled.error);
      return;
    }
    this.#send(writer, {
      type: "result",
      version: BROKER_PROTOCOL_VERSION,
      requestId,
      outcome: "ok",
      value: settled.value,
      error: null,
    });
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
      ([, entry]) => !entry.mutating,
    );
    for (const [requestId] of forgettable.slice(
      0,
      Math.max(0, forgettable.length - this.#answeredWindow),
    )) {
      this.#ledger.delete(requestId);
    }
  }
}
