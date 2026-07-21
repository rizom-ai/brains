import { Effect, Fiber, Schedule } from "@brains/utils/effect";
import type { Clock } from "@brains/utils/effect";
import type { GatewayListenerOptions } from "./types";

interface RestartingListenerSupervisorOptions {
  restartDelayMs: number;
  runListener: (
    options: GatewayListenerOptions,
    signal: AbortSignal,
  ) => Promise<unknown> | undefined;
  failureMessage: string;
  logger: {
    error: (message: string, context?: Record<string, unknown>) => void;
  };
  clock?: Clock.Clock | undefined;
}

/** Owns one restartable listener loop and drains tasks admitted by each cycle. */
export class RestartingListenerSupervisor {
  private readonly options: RestartingListenerSupervisorOptions;
  private readonly activeCycles = new Set<Promise<void>>();
  private loopFiber: Fiber.RuntimeFiber<unknown, never> | undefined;
  private loopController: AbortController | undefined;
  private stopPromise: Promise<void> | undefined;

  constructor(options: RestartingListenerSupervisorOptions) {
    this.options = options;
  }

  isRunning(): boolean {
    return this.loopFiber !== undefined;
  }

  start(): void {
    if (this.loopFiber || this.stopPromise) return;

    const controller = new AbortController();
    this.loopController = controller;
    const cycle = Effect.tryPromise({
      try: () => this.trackCycle(controller.signal),
      catch: (error) => error,
    }).pipe(
      Effect.catchAll((error) =>
        Effect.sync(() => {
          if (!controller.signal.aborted) {
            this.options.logger.error(this.options.failureMessage, { error });
          }
        }),
      ),
    );
    const loop = cycle.pipe(
      Effect.repeat(Schedule.spaced(Math.max(1, this.options.restartDelayMs))),
    );
    const ownedLoop = this.options.clock
      ? Effect.withClock(loop, this.options.clock)
      : loop;
    this.loopFiber = Effect.runFork(ownedLoop);
  }

  stop(): Promise<void> {
    if (this.stopPromise) return this.stopPromise;

    const transition = this.stopLoop();
    this.stopPromise = transition;
    void transition.then(
      () => this.clearStopTransition(transition),
      () => this.clearStopTransition(transition),
    );
    return transition;
  }

  private async stopLoop(): Promise<void> {
    const fiber = this.loopFiber;
    const controller = this.loopController;
    this.loopFiber = undefined;
    this.loopController = undefined;
    controller?.abort(new Error("Chat listener loop stopped"));
    if (fiber) {
      await Effect.runPromise(Fiber.interrupt(fiber));
    }
    await Promise.allSettled([...this.activeCycles]);
  }

  private trackCycle(signal: AbortSignal): Promise<void> {
    const tasks: Promise<unknown>[] = [];
    const cycle = (async (): Promise<void> => {
      try {
        await this.options.runListener(
          {
            waitUntil: (task): void => {
              tasks.push(task);
            },
          },
          signal,
        );
      } finally {
        await Promise.allSettled(tasks);
      }
    })();
    const tracked = cycle.finally(() => {
      this.activeCycles.delete(tracked);
    });
    this.activeCycles.add(tracked);
    return tracked;
  }

  private clearStopTransition(transition: Promise<void>): void {
    if (this.stopPromise === transition) {
      this.stopPromise = undefined;
    }
  }
}
