import type { Logger } from "@brains/utils/logger";
import type {
  EmailImapConfig,
  InboundEmailClient,
  InboundEmailClientFactory,
  InboundEmailSelection,
} from "./inbound-email";

const BASE_BACKOFF_MS = 1_000;
const MAX_BACKOFF_MS = 60_000;
export type InboundEmailSleep = (
  milliseconds: number,
  signal: AbortSignal,
) => Promise<void>;
export interface InboundEmailSupervisorOptions {
  config: EmailImapConfig;
  createClient: InboundEmailClientFactory;
  intake: (
    client: InboundEmailClient,
    selection: InboundEmailSelection,
    signal: AbortSignal,
  ) => Promise<number>;
  logger: Logger;
  sleep?: InboundEmailSleep | undefined;
}
interface OwnedClient {
  client: InboundEmailClient;
  retirement?: Promise<void>;
}
interface Connection {
  owner: OwnedClient;
  selection: InboundEmailSelection;
}
interface SupervisorRun {
  controller: AbortController;
  owners: Set<OwnedClient>;
  connected?: OwnedClient | undefined;
  startup?: Promise<void>;
  loop?: Promise<void>;
  failure?: unknown;
}

/** Own every connection before its first await, including initial intake and
 * reconnect. Restart is fenced until all operations and disconnects settle.
 */
export class InboundEmailSupervisor {
  private readonly options: InboundEmailSupervisorOptions;
  private readonly sleep: InboundEmailSleep;
  private current: SupervisorRun | undefined;
  private stopping: Promise<void> | undefined;

  constructor(options: InboundEmailSupervisorOptions) {
    this.options = options;
    this.sleep = options.sleep ?? abortableSleep;
  }
  isRunning(): boolean {
    return (
      this.current !== undefined &&
      this.current.failure === undefined &&
      !this.current.controller.signal.aborted
    );
  }
  isConnected(): boolean {
    return this.isRunning() && this.current?.connected !== undefined;
  }
  start(): Promise<void> {
    if (this.stopping)
      return Promise.reject(
        new Error("Inbound email listener has not retired"),
      );
    if (this.current?.failure !== undefined)
      return Promise.reject(this.current.failure);
    if (this.current) return this.current.startup ?? Promise.resolve();
    const state: SupervisorRun = {
      controller: new AbortController(),
      owners: new Set(),
    };
    this.current = state;
    // Store the startup promise before invoking any collaborator.
    state.startup = Promise.resolve()
      .then(() => this.initialize(state))
      .catch((error: unknown): never => {
        state.failure = error;
        throw error;
      });
    return state.startup;
  }
  stop(): Promise<void> {
    if (this.stopping) return this.stopping;
    const state = this.current;
    if (!state) return Promise.resolve();
    this.stopping = Promise.resolve().then(() => this.finishStop(state));
    state.controller.abort(new Error("Inbound email listener stopped"));
    return this.stopping;
  }
  private acquire(state: SupervisorRun): OwnedClient {
    state.controller.signal.throwIfAborted();
    const owner = { client: this.options.createClient(this.options.config) };
    state.owners.add(owner);
    return owner;
  }
  private retire(state: SupervisorRun, owner: OwnedClient): Promise<void> {
    owner.retirement ??= Promise.resolve()
      .then(() => owner.client.disconnect())
      .then((): void => {
        state.owners.delete(owner);
      });
    return owner.retirement;
  }
  private async retireFailure(
    state: SupervisorRun,
    owner: OwnedClient | undefined,
    failure: unknown,
  ): Promise<void> {
    if (!owner) return;
    try {
      await this.retire(state, owner);
    } catch (retirement) {
      throw new AggregateError(
        [failure, retirement],
        "Inbound email operation and retirement failed",
        { cause: retirement },
      );
    }
  }
  private async finishStop(state: SupervisorRun): Promise<void> {
    const results = await Promise.allSettled([
      state.startup,
      state.loop,
      ...[...state.owners].map((owner) => this.retire(state, owner)),
    ]);
    const failures = new Set<unknown>();
    for (const result of results)
      if (result.status === "rejected") failures.add(result.reason);
    if (state.failure !== undefined) failures.add(state.failure);
    if (failures.size === 1) throw [...failures][0];
    if (failures.size > 1)
      throw new AggregateError([...failures], "Inbound email shutdown failed", {
        cause: [...failures][0],
      });
    if (this.current === state) this.current = undefined;
    this.stopping = undefined;
  }
  private async initialize(state: SupervisorRun): Promise<void> {
    let owner: OwnedClient | undefined;
    try {
      owner = this.acquire(state);
      const selection = await this.connectAndIntake(state, owner);
      state.controller.signal.throwIfAborted();
      state.connected = owner;
      state.loop = this.observeLoop(
        state,
        this.runLoop(state, { owner, selection }),
      );
    } catch (error) {
      await this.retireFailure(state, owner, error);
      if (state.controller.signal.aborted) return;
      this.options.logger.warn(
        "Inbound email initial connection failed; reconnecting",
      );
      state.loop = this.observeLoop(state, this.recover(state));
    }
  }
  private async recover(state: SupervisorRun): Promise<void> {
    const connection = await this.reconnect(state, undefined, 0);
    await this.runLoop(state, connection);
  }
  private async runLoop(
    state: SupervisorRun,
    initial: Connection,
  ): Promise<void> {
    const signal = state.controller.signal;
    let connection = initial;
    let mode = this.options.config.pollMode;
    let reconnectAttempt = 0;
    while (!isAborted(signal)) {
      if (mode === "idle") {
        try {
          await connection.owner.client.waitForChanges(signal);
        } catch {
          if (signal.aborted) return;
          mode = "interval";
          this.options.logger.warn(
            "Inbound email IDLE failed; falling back to interval polling",
          );
          continue;
        }
      } else {
        try {
          await this.sleep(this.options.config.pollIntervalMs, signal);
        } catch {
          if (signal.aborted) return;
          this.options.logger.warn(
            "Inbound email polling wait failed; reconnecting",
          );
          connection = await this.reconnect(
            state,
            connection.owner,
            reconnectAttempt,
          );
          reconnectAttempt++;
          mode = this.options.config.pollMode;
          continue;
        }
      }
      if (isAborted(signal)) return;
      try {
        await this.options.intake(
          connection.owner.client,
          connection.selection,
          signal,
        );
        reconnectAttempt = 0;
      } catch {
        if (signal.aborted) return;
        this.options.logger.warn("Inbound email polling failed; reconnecting");
        connection = await this.reconnect(
          state,
          connection.owner,
          reconnectAttempt,
        );
        reconnectAttempt++;
        mode = this.options.config.pollMode;
      }
    }
  }
  private async reconnect(
    state: SupervisorRun,
    previous: OwnedClient | undefined,
    initialAttempt: number,
  ): Promise<Connection> {
    const signal = state.controller.signal;
    if (previous) {
      if (state.connected === previous) state.connected = undefined;
      await this.retire(state, previous);
    }
    let attempt = initialAttempt;
    while (!isAborted(signal)) {
      const retryInMs = inboundEmailBackoffMs(attempt);
      this.options.logger.debug("Inbound email reconnect scheduled", {
        retryInMs,
      });
      await this.sleep(retryInMs, signal);
      signal.throwIfAborted();
      let owner: OwnedClient | undefined;
      try {
        owner = this.acquire(state);
        const selection = await this.connectAndIntake(state, owner);
        signal.throwIfAborted();
        state.connected = owner;
        return { owner, selection };
      } catch (error) {
        await this.retireFailure(state, owner, error);
        if (signal.aborted) break;
        attempt++;
        this.options.logger.warn("Inbound email reconnect failed");
      }
    }
    signal.throwIfAborted();
    throw new Error("Inbound email reconnect aborted");
  }
  private async connectAndIntake(
    state: SupervisorRun,
    owner: OwnedClient,
  ): Promise<InboundEmailSelection> {
    const signal = state.controller.signal;
    signal.throwIfAborted();
    await owner.client.connect(signal);
    signal.throwIfAborted();
    const mailbox = this.options.config.mailbox;
    const uidValidity = await owner.client.selectMailbox(mailbox);
    signal.throwIfAborted();
    const selection = { mailbox, uidValidity };
    await this.options.intake(owner.client, selection, signal);
    return selection;
  }
  private observeLoop(
    state: SupervisorRun,
    loop: Promise<void>,
  ): Promise<void> {
    return loop.catch((error: unknown): void => {
      if (error !== state.controller.signal.reason) state.failure = error;
      if (!state.controller.signal.aborted)
        this.options.logger.error("Inbound email supervision stopped");
    });
  }
}

function isAborted(signal: AbortSignal): boolean {
  return signal.aborted;
}

export function inboundEmailBackoffMs(attempt: number): number {
  const exponent = Math.min(Math.max(0, Math.floor(attempt)), 6);
  return Math.min(MAX_BACKOFF_MS, BASE_BACKOFF_MS * 2 ** exponent);
}
function abortableSleep(
  milliseconds: number,
  signal: AbortSignal,
): Promise<void> {
  if (signal.aborted) return Promise.reject(signal.reason);
  return new Promise((resolve, reject) => {
    const onAbort = (): void => {
      clearTimeout(timeout);
      reject(signal.reason);
    };
    const timeout = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, milliseconds);
    timeout.unref();
    signal.addEventListener("abort", onAbort, { once: true });
  });
}
