import { createId } from "@brains/utils/id";
import { deferred } from "@brains/utils/deferred";
import {
  Context,
  Effect,
  Exit,
  Layer,
  Schedule,
  Scope,
} from "@brains/utils/effect";
import {
  RpcClient,
  RpcClientError,
  RpcSerialization,
  Stream,
} from "@brains/utils/effect/rpc";
import type {
  BrokerRpc,
  BrokerRpcEvent,
  BrokerRpcStatus,
} from "./rpc-contract";
import { BrokerRpcs } from "./rpc-contract";
import { brokerRpcClientSocket } from "./rpc-client-socket";
import { makeBrokerRpcSerialization } from "./rpc-serialization";
import { BROKER_PROTOCOL_VERSION } from "./protocol";
import type { StatusMessage } from "./protocol";
import { parseGitOperationResult } from "./operations";
import type { GitOperation, GitOperationResult } from "./operations";

/** Giving up observation never cancels broker-owned Git work. */
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

type Client = RpcClient.RpcClient<BrokerRpc, RpcClientError.RpcClientError>;
interface InFlightRequest {
  checkoutPath: string;
  operationIdentity: string;
  reply: Promise<unknown>;
}

/** Promise/AbortSignal facade; the connection scope owns only RPC observation. */
export class BrokerConnection {
  readonly #socketPath: string;
  readonly #scope = Effect.runSync(Scope.make());
  readonly #lifetime = new AbortController();
  readonly #unavailableListeners = new Set<() => void>();
  readonly #waiters = new Map<string, InFlightRequest>();
  #client: Client | undefined;
  #closed = false;

  private constructor(socketPath: string) {
    this.#socketPath = socketPath;
  }

  static async connect(socketPath: string): Promise<BrokerConnection> {
    const connection = new BrokerConnection(socketPath);
    const connected = deferred();
    const protocol = Layer.effect(
      RpcClient.Protocol,
      RpcClient.makeProtocolSocket({ retryPolicy: Schedule.recurs(0) }),
    ).pipe(
      Layer.provide(brokerRpcClientSocket(socketPath)),
      Layer.provide(
        Layer.succeed(
          RpcSerialization.RpcSerialization,
          makeBrokerRpcSerialization(),
        ),
      ),
    );
    try {
      connection.#client = await Effect.runPromise(
        Scope.provide(
          Effect.gen(function* () {
            // Build in the lifetime scope: providing only around make() would
            // close its transport as soon as the constructed client is returned.
            const services = yield* Layer.build(protocol).pipe(
              Effect.provideService(RpcClient.ConnectionHooks, {
                onConnect: Effect.sync(() => connected.resolve()),
                onDisconnect: Effect.sync(() => {
                  const error = new BrokerUnavailableError(
                    socketPath,
                    "broker closed the connection",
                  );
                  connected.reject(error);
                  connection.#abandon(error);
                }),
              }),
            );
            return yield* RpcClient.make(BrokerRpcs, {
              disableTracing: true,
            }).pipe(
              Effect.provideService(
                RpcClient.Protocol,
                Context.get(services, RpcClient.Protocol),
              ),
            );
          }),
          connection.#scope,
        ),
      );
      await connected.promise;
      return connection;
    } catch (error) {
      connection.close();
      throw error instanceof BrokerUnavailableError
        ? error
        : new BrokerUnavailableError(socketPath, String(error));
    }
  }

  onUnavailable(listener: () => void): () => void {
    this.#unavailableListeners.add(listener);
    return (): void => {
      this.#unavailableListeners.delete(listener);
    };
  }

  close(): void {
    if (this.#closed) return;
    this.#unavailableListeners.clear();
    this.#abandon(
      new BrokerUnavailableError(
        this.#socketPath,
        "client closed the connection",
      ),
    );
  }

  #abandon(error: BrokerUnavailableError): void {
    if (this.#closed) return;
    this.#closed = true;
    this.#lifetime.abort(error);
    const listeners = [...this.#unavailableListeners];
    this.#unavailableListeners.clear();
    // Public close is synchronous. This fiber owns only finalizing this scope,
    // independently of an onDisconnect callback running inside the same scope.
    Effect.runFork(Scope.close(this.#scope, Exit.void));
    listeners.forEach((listener) => listener());
  }

  #rpc(): Client {
    if (this.#closed || !this.#client)
      throw new BrokerUnavailableError(this.#socketPath, "connection closed");
    return this.#client;
  }

  async #run<A, E>(
    effect: Effect.Effect<A, E>,
    signal?: AbortSignal,
  ): Promise<A> {
    const observation = signal
      ? AbortSignal.any([signal, this.#lifetime.signal])
      : this.#lifetime.signal;
    try {
      return await Effect.runPromise(
        effect.pipe(
          Effect.onInterrupt(() =>
            Effect.sync(() => {
              if (!observation.aborted)
                this.#abandon(
                  new BrokerUnavailableError(
                    this.#socketPath,
                    "broker interrupted RPC observation",
                  ),
                );
            }),
          ),
        ),
        { signal: observation },
      );
    } catch (error) {
      if (observation.aborted) throw observation.reason;
      if (error instanceof RpcClientError.RpcClientError) {
        const unavailable = new BrokerUnavailableError(
          this.#socketPath,
          String(error),
        );
        this.#abandon(unavailable);
        throw unavailable;
      }
      if (
        typeof error === "object" &&
        error !== null &&
        "_tag" in error &&
        error._tag === "BrokerError" &&
        "message" in error &&
        typeof error.message === "string"
      ) {
        throw new BrokerOperationError(error.message);
      }
      throw error;
    }
  }

  #statusFacade(status: BrokerRpcStatus): StatusMessage {
    return {
      ...status,
      type: "status",
      version: BROKER_PROTOCOL_VERSION,
      requestId: `req_${createId(12)}`,
    };
  }

  async registerCheckout(declaration: {
    checkoutPath: string;
    branch: string;
    remoteFingerprint: string;
  }): Promise<StatusMessage> {
    return this.#statusFacade(
      await this.#run(this.#rpc().RegisterCheckout(declaration)),
    );
  }
  async openAdmission(): Promise<StatusMessage> {
    return this.#statusFacade(await this.#run(this.#rpc().OpenAdmission({})));
  }
  async status(): Promise<StatusMessage> {
    return this.#statusFacade(await this.#run(this.#rpc().QueryStatus({})));
  }

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
    const identity = JSON.stringify(operation);
    const existing = this.#waiters.get(requestId);
    if (existing) {
      if (
        existing.checkoutPath !== checkoutPath ||
        existing.operationIdentity !== identity
      ) {
        throw new BrokerOperationError(
          `Request ${requestId} is already used for different Git work`,
        );
      }
      return parseGitOperationResult<TOperation["name"]>(
        operation.name,
        await existing.reply,
      );
    }
    const client = this.#rpc();
    const completion = deferred<unknown>();
    this.#waiters.set(requestId, {
      checkoutPath,
      operationIdentity: identity,
      reply: completion.promise,
    });
    let terminal: Extract<BrokerRpcEvent, { _tag: "Result" }> | undefined;
    const observe = Stream.runForEach(
      client
        .ExecuteOperation({
          operationId: requestId,
          checkoutPath,
          operation,
        })
        .pipe(Stream.takeUntil((event) => event._tag === "Result")),
      (event) =>
        Effect.sync(() => {
          if (terminal)
            throw new BrokerOperationError(
              "Git RPC sent events after a terminal result",
            );
          if (event._tag === "Progress") runOptions.onProgress?.();
          else terminal = event;
        }),
    );
    void this.#run(observe, runOptions.signal)
      .then(() => {
        if (!terminal)
          throw new BrokerOperationError(
            "Git RPC ended without a terminal result",
          );
        if (terminal.outcome === "error")
          throw new BrokerOperationError(terminal.error ?? "unknown");
        return terminal.value;
      })
      .then(completion.resolve, completion.reject);
    try {
      return parseGitOperationResult<TOperation["name"]>(
        operation.name,
        await completion.promise,
      );
    } finally {
      this.#waiters.delete(requestId);
    }
  }
}
