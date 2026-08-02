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
  intake: (client: InboundEmailClient) => Promise<number>;
  logger: Logger;
  sleep?: InboundEmailSleep | undefined;
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
    return this.client !== undefined && this.controller !== undefined;
  }

  async start(): Promise<void> {
    if (this.controller) return;

    const controller = new AbortController();
    const client = this.options.createClient(this.options.config);
    try {
      await this.connectAndIntake(client);
    } catch (error) {
      controller.abort(new Error("Inbound email startup failed"));
      await disconnectWithoutThrow(client);
      throw error;
    }

    this.client = client;
    this.controller = controller;
    this.loop = this.run(client, controller.signal).catch((): void => {});
  }

  async stop(): Promise<void> {
    const controller = this.controller;
    const client = this.client;
    const loop = this.loop;
    this.controller = undefined;
    this.loop = undefined;
    if (!controller && !client && !loop) return;

    controller?.abort(new Error("Inbound email listener stopped"));
    let disconnectFailed = false;
    if (client) {
      try {
        await client.disconnect();
      } catch {
        disconnectFailed = true;
      }
    }
    await loop;
    const latestClient = this.client;
    if (latestClient && latestClient !== client) {
      try {
        await latestClient.disconnect();
      } catch {
        disconnectFailed = true;
      }
    }
    this.client = undefined;

    if (disconnectFailed) {
      throw new Error("Inbound email client failed to disconnect");
    }
  }

  private async run(
    initialClient: InboundEmailClient,
    signal: AbortSignal,
  ): Promise<void> {
    let client = initialClient;
    let mode = this.options.config.pollMode;
    let reconnectAttempt = 0;

    while (!isAborted(signal)) {
      try {
        if (mode === "idle") {
          await client.waitForChanges(signal);
        } else {
          await this.sleep(this.options.config.pollIntervalMs, signal);
        }
        if (isAborted(signal)) return;
        await this.options.intake(client);
        reconnectAttempt = 0;
      } catch {
        if (isAborted(signal)) return;
        if (mode === "idle") {
          mode = "interval";
          this.options.logger.warn(
            "Inbound email IDLE failed; falling back to interval polling",
          );
        } else {
          this.options.logger.warn(
            "Inbound email polling failed; reconnecting",
          );
        }

        client = await this.reconnect(client, reconnectAttempt, signal);
        reconnectAttempt += 1;
      }
    }
  }

  private async reconnect(
    previousClient: InboundEmailClient,
    initialAttempt: number,
    signal: AbortSignal,
  ): Promise<InboundEmailClient> {
    await disconnectWithoutThrow(previousClient);
    let attempt = initialAttempt;

    while (!isAborted(signal)) {
      const retryInMs = inboundEmailBackoffMs(attempt);
      this.options.logger.debug("Inbound email reconnect scheduled", {
        retryInMs,
      });
      await this.sleep(retryInMs, signal);
      if (isAborted(signal)) break;

      const nextClient = this.options.createClient(this.options.config);
      try {
        await this.connectAndIntake(nextClient);
        if (isAborted(signal)) {
          await disconnectWithoutThrow(nextClient);
          break;
        }
        this.client = nextClient;
        return nextClient;
      } catch {
        await disconnectWithoutThrow(nextClient);
        attempt += 1;
        this.options.logger.warn("Inbound email reconnect failed");
      }
    }

    throw new Error("Inbound email reconnect aborted");
  }

  private async connectAndIntake(client: InboundEmailClient): Promise<void> {
    await client.connect();
    await client.selectMailbox(this.options.config.mailbox);
    await this.options.intake(client);
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
