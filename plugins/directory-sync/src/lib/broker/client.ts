import { createId } from "@brains/utils/id";
import { BROKER_PROTOCOL_VERSION, FrameDecoder, encodeFrame } from "./protocol";
import type { BrokerMessage, ResultMessage, StatusMessage } from "./protocol";
import { SocketWriter } from "./socket-writer";
import { parseGitOperationResult } from "./operations";
import type { GitOperation, GitOperationResult } from "./operations";

/**
 * A connection to the Git broker.
 *
 * Deliberately has no timeout of its own. A caller that gave up on a slow
 * operation would be guessing about a mutation the broker still owns, and
 * acting on that guess is what turns a lost completion into a duplicate
 * commit. Waiting is correct; detecting a stalled owner is supervision's job.
 */

export class BrokerUnavailableError extends Error {
  constructor(socketPath: string, cause: string) {
    super(`Git broker at ${socketPath} is unavailable: ${cause}`);
    this.name = "BrokerUnavailableError";
  }
}

export class BrokerOperationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BrokerOperationError";
  }
}

type Reply = StatusMessage | ResultMessage;

interface Pending {
  resolve(message: Reply): void;
  reject(error: unknown): void;
  onProgress?: (() => void) | undefined;
}

/**
 * A caller that gives up stops waiting; the broker does not stop working.
 *
 * Cancelling here is a statement about this process — a shutting-down job has
 * no one left to hand a result to — not about the operation. The broker keeps
 * its turn and carries the mutation to a terminal result, which is what keeps
 * an abandoned request from becoming an unconfirmed unlock.
 */
function abandonOnAbort(
  signal: AbortSignal,
  pending: Map<string, Pending>,
  requestId: string,
  reject: (error: unknown) => void,
): () => void {
  const onAbort = (): void => {
    if (!pending.delete(requestId)) return;
    reject(signal.reason);
  };
  signal.addEventListener("abort", onAbort, { once: true });
  return (): void => signal.removeEventListener("abort", onAbort);
}

function expectStatus(reply: Reply): StatusMessage {
  if (reply.type !== "status") {
    throw new BrokerOperationError("The broker answered with no status");
  }
  return reply;
}

export class BrokerConnection {
  readonly #socketPath: string;
  readonly #pending = new Map<string, Pending>();
  #writer: SocketWriter | null = null;
  #socket: { end(): void } | null = null;
  #closed = false;

  private constructor(socketPath: string) {
    this.#socketPath = socketPath;
  }

  static async connect(socketPath: string): Promise<BrokerConnection> {
    const connection = new BrokerConnection(socketPath);
    const decoder = new FrameDecoder();

    const socket = await Bun.connect({
      unix: socketPath,
      socket: {
        data: (_socket, chunk): void => {
          decoder.push(chunk).forEach((message) => {
            connection.#receive(message);
          });
        },
        drain: (): void => connection.#writer?.flush(),
        close: (): void => connection.#abandon("broker closed the connection"),
        error: (_socket, error): void => connection.#abandon(String(error)),
      },
    }).catch((error: unknown) => {
      throw new BrokerUnavailableError(socketPath, String(error));
    });

    connection.#socket = socket;
    connection.#writer = new SocketWriter(socket);
    return connection;
  }

  close(): void {
    if (this.#closed) return;
    // Closing is this process letting go, not the operation ending. Whoever is
    // still waiting learns that now; hanging them would be the one outcome a
    // shutdown must not produce.
    const waiting = [...this.#pending.values()];
    this.#pending.clear();
    this.#closed = true;
    this.#socket?.end();
    waiting.forEach((pending) => {
      pending.reject(
        new BrokerUnavailableError(
          this.#socketPath,
          "client closed the connection",
        ),
      );
    });
  }

  #receive(message: BrokerMessage): void {
    if (message.type === "progress") {
      this.#pending.get(message.requestId)?.onProgress?.();
      return;
    }
    if (message.type !== "status" && message.type !== "result") return;

    const pending = this.#pending.get(message.requestId);
    if (!pending) return;
    this.#pending.delete(message.requestId);

    if (message.type === "status") {
      pending.resolve(message);
      return;
    }
    if (message.outcome === "error") {
      pending.reject(new BrokerOperationError(message.error ?? "unknown"));
      return;
    }
    pending.resolve(message);
  }

  /** Every in-flight caller learns the broker is gone rather than hanging. */
  #abandon(reason: string): void {
    if (this.#closed) return;
    this.#closed = true;
    const waiting = [...this.#pending.values()];
    this.#pending.clear();
    waiting.forEach((pending) => {
      pending.reject(new BrokerUnavailableError(this.#socketPath, reason));
    });
  }

  #send(message: BrokerMessage): void {
    if (this.#closed) {
      throw new BrokerUnavailableError(this.#socketPath, "connection closed");
    }
    this.#writer?.send(encodeFrame(message));
  }

  async registerCheckout(declaration: {
    checkoutPath: string;
    branch: string;
    remoteFingerprint: string;
  }): Promise<StatusMessage> {
    const requestId = `req_${createId(12)}`;
    const settled = Promise.withResolvers<Reply>();
    this.#pending.set(requestId, settled);
    this.#send({
      type: "register-checkout",
      version: BROKER_PROTOCOL_VERSION,
      requestId,
      ...declaration,
    });
    return expectStatus(await settled.promise);
  }

  async status(): Promise<StatusMessage> {
    const requestId = `req_${createId(12)}`;
    const settled = Promise.withResolvers<Reply>();
    this.#pending.set(requestId, settled);
    this.#send({ type: "query", version: BROKER_PROTOCOL_VERSION, requestId });
    return expectStatus(await settled.promise);
  }

  /**
   * Run an operation under a caller-chosen id, so a lost reply can be asked
   * for again without the work being done twice.
   */
  executeWithId<TOperation extends GitOperation>(
    requestId: string,
    checkoutPath: string,
    operation: TOperation,
    runOptions: {
      onProgress?: (() => void) | undefined;
      signal?: AbortSignal | undefined;
    } = {},
  ): Promise<GitOperationResult<TOperation["name"]>> {
    return this.#execute(requestId, checkoutPath, operation, runOptions);
  }

  async execute<TOperation extends GitOperation>(
    checkoutPath: string,
    operation: TOperation,
    runOptions: {
      onProgress?: (() => void) | undefined;
      signal?: AbortSignal | undefined;
    } = {},
  ): Promise<GitOperationResult<TOperation["name"]>> {
    return this.#execute(
      `req_${createId(12)}`,
      checkoutPath,
      operation,
      runOptions,
    );
  }

  async #execute<TOperation extends GitOperation>(
    requestId: string,
    checkoutPath: string,
    operation: TOperation,
    runOptions: {
      onProgress?: (() => void) | undefined;
      signal?: AbortSignal | undefined;
    },
  ): Promise<GitOperationResult<TOperation["name"]>> {
    runOptions.signal?.throwIfAborted();
    const settled = Promise.withResolvers<Reply>();
    this.#pending.set(requestId, {
      ...settled,
      ...(runOptions.onProgress ? { onProgress: runOptions.onProgress } : {}),
    });
    const stopWatchingAbort = runOptions.signal
      ? abandonOnAbort(
          runOptions.signal,
          this.#pending,
          requestId,
          settled.reject,
        )
      : (): void => {};

    try {
      this.#send({
        type: "execute-operation",
        version: BROKER_PROTOCOL_VERSION,
        requestId,
        checkoutPath,
        operation,
      });

      const reply = await settled.promise;
      if (reply.type !== "result") {
        throw new BrokerOperationError(
          "The broker answered an operation with a status frame",
        );
      }
      return parseGitOperationResult<TOperation["name"]>(
        operation.name,
        reply.value,
      );
    } finally {
      stopWatchingAbort();
    }
  }
}
