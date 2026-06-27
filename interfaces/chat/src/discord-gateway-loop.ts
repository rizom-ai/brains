import type { DiscordChatAdapter } from "./types";

interface DiscordGatewayLoopDeps {
  /** The Chat SDK app must exist (initialized by the caller) before the loop runs. */
  getApp: () => unknown;
  gatewayRunMs: number;
  gatewayRestartDelayMs: number;
  logger: {
    debug: (message: string, context?: Record<string, unknown>) => void;
    error: (message: string, context?: Record<string, unknown>) => void;
  };
}

/**
 * Runs the Discord gateway listener as a resilient background loop: poll the
 * adapter for a window, settle deferred tasks, and on failure log and restart
 * after a delay — until aborted. Owns its own abort/promise lifecycle. App
 * initialize/shutdown stays with the interface daemon; this only owns the poll.
 *
 * One-off for the chat interface — not a shared abstraction. If a second
 * gateway-driven adapter ever appears, promote it then.
 */
export class DiscordGatewayLoop {
  private adapter: DiscordChatAdapter | undefined;
  private abortController: AbortController | undefined;
  private loopPromise: Promise<void> | undefined;

  constructor(private readonly deps: DiscordGatewayLoopDeps) {}

  setAdapter(adapter: DiscordChatAdapter): void {
    this.adapter = adapter;
  }

  isRunning(): boolean {
    return this.loopPromise !== undefined;
  }

  start(): void {
    if (this.loopPromise) return;
    this.abortController = new AbortController();
    this.loopPromise = this.run(this.abortController.signal);
  }

  async stop(): Promise<void> {
    this.abortController?.abort();
    await this.loopPromise?.catch((error: unknown) =>
      this.deps.logger.debug("Chat gateway loop stopped with error", { error }),
    );
    this.loopPromise = undefined;
    this.abortController = undefined;
  }

  private async run(signal: AbortSignal): Promise<void> {
    if (!this.deps.getApp()) return;
    const adapter = this.adapter;
    if (!adapter) return;
    while (!this.isAborted(signal)) {
      const tasks: Promise<unknown>[] = [];
      try {
        await adapter.startGatewayListener(
          { waitUntil: (task): void => void tasks.push(task) },
          this.deps.gatewayRunMs,
          signal,
        );
        await Promise.allSettled(tasks);
      } catch (error: unknown) {
        if (this.isAborted(signal)) return;
        this.deps.logger.error("Discord gateway listener failed", { error });
      }

      if (this.isAborted(signal)) return;
      await this.delay(this.deps.gatewayRestartDelayMs, signal);
    }
  }

  private isAborted(signal: AbortSignal): boolean {
    return signal.aborted;
  }

  private delay(ms: number, signal: AbortSignal): Promise<void> {
    return new Promise((resolve) => {
      const timeout = setTimeout(resolve, ms);
      signal.addEventListener(
        "abort",
        () => {
          clearTimeout(timeout);
          resolve();
        },
        { once: true },
      );
    });
  }
}
