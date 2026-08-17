import { RestartingListenerSupervisor } from "./restarting-listener-supervisor";
import type { SlackChatAdapter } from "./types";

/**
 * The part of the Slack adapter this loop drives.
 *
 * SlackChatAdapter extends Adapter, so asking for the whole thing meant a test
 * could only supply a listener by asserting it was a full adapter. Pick keeps
 * this in step with the real signature automatically.
 */
export type SocketModeListener = Pick<
  SlackChatAdapter,
  "startSocketModeListener"
>;

interface SlackSocketLoopDeps {
  listenerRunMs: number;
  restartDelayMs: number;
  logger: {
    debug: (message: string, context?: Record<string, unknown>) => void;
    error: (message: string, context?: Record<string, unknown>) => void;
  };
}

/** Runs Slack Socket Mode as a resilient, supervised background loop. */
export class SlackSocketLoop {
  private adapter: SocketModeListener | undefined;
  private readonly supervisor: RestartingListenerSupervisor;

  constructor(deps: SlackSocketLoopDeps) {
    this.supervisor = new RestartingListenerSupervisor({
      restartDelayMs: deps.restartDelayMs,
      failureMessage: "Slack socket listener failed",
      logger: deps.logger,
      runListener: (options, signal): Promise<Response> | undefined =>
        this.adapter?.startSocketModeListener(
          options,
          deps.listenerRunMs,
          signal,
        ),
    });
  }

  setAdapter(adapter: SocketModeListener): void {
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
