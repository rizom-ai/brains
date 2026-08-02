import type { Logger } from "@brains/utils/logger";
import type {
  EmailImapConfig,
  InboundEmailClient,
  InboundEmailClientFactory,
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
  intake: (client: InboundEmailClient, uidValidity: string) => Promise<number>;
  logger: Logger;
  sleep?: InboundEmailSleep | undefined;
}

interface InboundEmailConnection {
  client: InboundEmailClient;
  uidValidity: string;
}

/** Owns the active IMAP client and its abortable IDLE/polling loop. */
export class InboundEmailSupervisor {
  private readonly options: InboundEmailSupervisorOptions;
  private readonly sleep: InboundEmailSleep;
  private client: InboundEmailClient | undefined;
  private controller: AbortController | undefined;
  private loop: Promise<void> | undefined;

  constructor(options: InboundEmailSupervisorOptions) {
    this.options = options;
    this.sleep = options.sleep ?? abortableSleep;
  }

  isRunning(): boolean {
    return this.controller !== undefined;
  }

  isConnected(): boolean {
    return this.client !== undefined;
  }

  async start(): Promise<void> {
    if (this.controller) return;

    const controller = new AbortController();
    this.controller = controller;
    let client: InboundEmailClient | undefined;
    try {
      client = this.options.createClient(this.options.config);
      const uidValidity = await this.connectAndIntake(client);
      if (isAborted(controller.signal)) {
        await disconnectWithoutThrow(client);
        return;
      }
      this.client = client;
      this.loop = this.observeLoop(
        this.run({ client, uidValidity }, controller.signal),
        controller.signal,
      );
    } catch {
      if (client) await disconnectWithoutThrow(client);
      if (isAborted(controller.signal)) return;
      this.options.logger.warn(
        "Inbound email initial connection failed; reconnecting",
      );
      this.loop = this.observeLoop(
        this.recover(0, controller.signal),
        controller.signal,
      );
    }
  }

  async stop(): Promise<void> {
    const controller = this.controller;
    const client = this.client;
    const loop = this.loop;
    this.controller = undefined;
    this.loop = undefined;
    if (!controller && !client && !loop) return;

    controller?.abort(new Error("Inbound email listener stopped"));
    let disconnectError: unknown;
    if (client) {
      try {
        await client.disconnect();
      } catch (error) {
        disconnectError = error;
      }
    }
    await loop;
    const latestClient = this.client;
    if (latestClient && latestClient !== client) {
      try {
        await latestClient.disconnect();
      } catch (error) {
        disconnectError ??= error;
      }
    }
    this.client = undefined;

    if (disconnectError) throw disconnectError;
  }

  private async recover(
    initialAttempt: number,
    signal: AbortSignal,
  ): Promise<void> {
    const connection = await this.reconnect(undefined, initialAttempt, signal);
    await this.run(connection, signal);
  }

  private async run(
    initialConnection: InboundEmailConnection,
    signal: AbortSignal,
  ): Promise<void> {
    let connection = initialConnection;
    let mode = this.options.config.pollMode;
    let reconnectAttempt = 0;

    while (!isAborted(signal)) {
      if (mode === "idle") {
        try {
          await connection.client.waitForChanges(signal);
        } catch {
          if (isAborted(signal)) return;
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
          if (isAborted(signal)) return;
          this.options.logger.warn(
            "Inbound email polling wait failed; reconnecting",
          );
          connection = await this.reconnect(
            connection.client,
            reconnectAttempt,
            signal,
          );
          reconnectAttempt += 1;
          mode = this.options.config.pollMode;
          continue;
        }
      }

      if (isAborted(signal)) return;
      try {
        await this.options.intake(connection.client, connection.uidValidity);
        reconnectAttempt = 0;
      } catch {
        if (isAborted(signal)) return;
        this.options.logger.warn("Inbound email polling failed; reconnecting");
        connection = await this.reconnect(
          connection.client,
          reconnectAttempt,
          signal,
        );
        reconnectAttempt += 1;
        mode = this.options.config.pollMode;
      }
    }
  }

  private async reconnect(
    previousClient: InboundEmailClient | undefined,
    initialAttempt: number,
    signal: AbortSignal,
  ): Promise<InboundEmailConnection> {
    if (previousClient) {
      await disconnectWithoutThrow(previousClient);
      if (this.client === previousClient) this.client = undefined;
    }
    let attempt = initialAttempt;

    while (!isAborted(signal)) {
      const retryInMs = inboundEmailBackoffMs(attempt);
      this.options.logger.debug("Inbound email reconnect scheduled", {
        retryInMs,
      });
      await this.sleep(retryInMs, signal);
      if (isAborted(signal)) break;

      let nextClient: InboundEmailClient | undefined;
      try {
        nextClient = this.options.createClient(this.options.config);
        const uidValidity = await this.connectAndIntake(nextClient);
        if (isAborted(signal)) {
          await disconnectWithoutThrow(nextClient);
          break;
        }
        this.client = nextClient;
        return { client: nextClient, uidValidity };
      } catch {
        if (nextClient) await disconnectWithoutThrow(nextClient);
        attempt += 1;
        this.options.logger.warn("Inbound email reconnect failed");
      }
    }

    throw new Error("Inbound email reconnect aborted");
  }

  private async connectAndIntake(client: InboundEmailClient): Promise<string> {
    await client.connect();
    const uidValidity = await client.selectMailbox(this.options.config.mailbox);
    await this.options.intake(client, uidValidity);
    return uidValidity;
  }

  private observeLoop(loop: Promise<void>, signal: AbortSignal): Promise<void> {
    return loop.catch((): void => {
      if (isAborted(signal)) return;
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

async function disconnectWithoutThrow(
  client: InboundEmailClient,
): Promise<void> {
  try {
    await client.disconnect();
  } catch {
    // The reconnect path must continue without exposing transport errors.
  }
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
