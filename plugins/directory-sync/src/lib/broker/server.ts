import { chmod, mkdir, unlink } from "fs/promises";
import { join, resolve } from "path";
import { createId } from "@brains/utils/id";
import { getErrorMessage } from "@brains/utils/error";
import { CheckoutOperationExecutor } from "./checkout-executor";
import type { CheckoutExecutorOptions } from "./checkout-executor";
import { BROKER_PROTOCOL_VERSION, FrameDecoder, encodeFrame } from "./protocol";
import type {
  BrokerMessage,
  ExecuteOperationMessage,
  RegisterCheckoutMessage,
} from "./protocol";
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
  /**
   * Checkout configuration by canonical path. Resolved here rather than sent,
   * so a token never enters a protocol frame.
   */
  resolveCheckout: (
    checkoutPath: string,
  ) => CheckoutExecutorOptions | undefined;
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
  readonly #active = new Map<string, string>();
  readonly #resolveCheckout: GitBrokerServerOptions["resolveCheckout"];
  #server: { stop(closeActiveConnections?: boolean): void } | null = null;

  private constructor(
    socketPath: string,
    brokerId: string,
    resolveCheckout: GitBrokerServerOptions["resolveCheckout"],
  ) {
    this.socketPath = socketPath;
    this.brokerId = brokerId;
    this.#resolveCheckout = resolveCheckout;
  }

  static async start(
    options: GitBrokerServerOptions,
  ): Promise<GitBrokerServer> {
    await mkdir(options.runtimeDir, { recursive: true, mode: 0o700 });
    await chmod(options.runtimeDir, 0o700);
    const socketPath = join(options.runtimeDir, "git-broker.sock");

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
      activeRequestIds: [...this.#active.keys()].sort(),
      oldestActiveStartedAt: null,
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
    const executor = this.#executors.get(resolve(message.checkoutPath));
    if (!executor) {
      this.#fail(
        writer,
        message.requestId,
        new Error(`Checkout ${message.checkoutPath} is not registered`),
      );
      return;
    }

    this.#active.set(message.requestId, message.checkoutPath);
    try {
      const value = await executor.execute(message.operation, {
        // Keeps the caller's operation-status heartbeat fresh through a long
        // clone or pull; without it a healthy slow operation looks stalled.
        onProgress: (): void => {
          this.#send(writer, {
            type: "progress",
            version: BROKER_PROTOCOL_VERSION,
            requestId: message.requestId,
            phase: "running",
            observedAt: new Date().toISOString(),
          });
        },
      });
      this.#send(writer, {
        type: "result",
        version: BROKER_PROTOCOL_VERSION,
        requestId: message.requestId,
        outcome: "ok",
        value: value ?? null,
        error: null,
      });
    } catch (error) {
      this.#fail(writer, message.requestId, error);
    } finally {
      this.#active.delete(message.requestId);
    }
  }
}
