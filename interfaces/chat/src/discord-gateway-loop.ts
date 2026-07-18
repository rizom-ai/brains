import { RestartingListenerSupervisor } from "./restarting-listener-supervisor";
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
 * adapter for a window, drain deferred tasks, and on failure log and restart
 * after a delay — until stopped. App initialize/shutdown stays with the
 * interface daemon; this only owns the poll.
 */
export class DiscordGatewayLoop {
  private adapter: DiscordChatAdapter | undefined;
  private readonly supervisor: RestartingListenerSupervisor;

  constructor(deps: DiscordGatewayLoopDeps) {
    this.supervisor = new RestartingListenerSupervisor({
      restartDelayMs: deps.gatewayRestartDelayMs,
      failureMessage: "Discord gateway listener failed",
      logger: deps.logger,
      runListener: (options, signal): Promise<Response> | undefined => {
        if (!deps.getApp()) return undefined;
        return this.adapter?.startGatewayListener(
          options,
          deps.gatewayRunMs,
          signal,
        );
      },
    });
  }

  setAdapter(adapter: DiscordChatAdapter): void {
    this.adapter = adapter;
  }

  isRunning(): boolean {
    return this.supervisor.isRunning();
  }

  start(): void {
    this.supervisor.start();
  }

  stop(): Promise<void> {
    return this.supervisor.stop();
  }
}
