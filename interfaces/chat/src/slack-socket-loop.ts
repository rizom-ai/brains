import type { SlackChatAdapter } from "./types";

interface SlackSocketLoopDeps {
  listenerRunMs: number;
  restartDelayMs: number;
  logger: {
    debug: (message: string, context?: Record<string, unknown>) => void;
    error: (message: string, context?: Record<string, unknown>) => void;
  };
}

/** Runs Slack Socket Mode as a resilient, abortable background loop. */
export class SlackSocketLoop {
  private readonly deps: SlackSocketLoopDeps;
  private adapter: SlackChatAdapter | undefined;
  private abortController: AbortController | undefined;
  private loopPromise: Promise<void> | undefined;

  constructor(deps: SlackSocketLoopDeps) {
    this.deps = deps;
  }

  setAdapter(adapter: SlackChatAdapter): void {
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
      this.deps.logger.debug("Slack socket loop stopped with error", { error }),
    );
    this.loopPromise = undefined;
    this.abortController = undefined;
  }

  private async run(signal: AbortSignal): Promise<void> {
    const adapter = this.adapter;
    if (!adapter) return;
    while (!this.isAborted(signal)) {
      const tasks: Promise<unknown>[] = [];
      try {
        await adapter.startSocketModeListener(
          { waitUntil: (task): void => void tasks.push(task) },
          this.deps.listenerRunMs,
          signal,
        );
        await Promise.allSettled(tasks);
      } catch (error: unknown) {
        if (this.isAborted(signal)) return;
        this.deps.logger.error("Slack socket listener failed", { error });
      }

      if (this.isAborted(signal)) return;
      await this.delay(this.deps.restartDelayMs, signal);
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
