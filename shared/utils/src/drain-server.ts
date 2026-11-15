import type { Logger } from "./logger";

/** How long a stopping listener lets requests in flight finish. */
export const DEFAULT_SHUTDOWN_DRAIN_MS = 5_000;

/** The part of a Bun server a bounded stop uses. */
export interface DrainableServer {
  /** Requests in flight, when the server counts them. */
  readonly pendingRequests?: number | undefined;
  stop(closeActiveConnections?: boolean): Promise<void> | void;
}

export interface DrainOptions {
  drainMs: number;
  logger: Pick<Logger, "warn">;
  /** Names the listener in the log line, e.g. "Webserver". */
  label: string;
}

/**
 * Stop a listener within a deadline. Bun's graceful stop closes the listener
 * and waits for every request in flight, and a held stream or a body that
 * never finishes would make it wait forever. Past `drainMs` the requests
 * still open are closed.
 */
export async function stopServerWithinDrain(
  server: DrainableServer,
  options: DrainOptions,
): Promise<void> {
  const graceful = Promise.resolve(server.stop(false));
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<"deadline">((resolve) => {
    timer = setTimeout(() => resolve("deadline"), Math.max(0, options.drainMs));
  });
  const first = await Promise.race([
    graceful.then(() => "drained" as const),
    deadline,
  ]).finally(() => clearTimeout(timer));
  if (first === "drained") return;

  options.logger.warn(
    `${options.label} drain passed ${options.drainMs}ms with ${server.pendingRequests ?? "unknown"} request(s) in flight; closing them`,
  );
  // A forced stop terminates the open connections at once, but Bun settles
  // its promise, and the graceful one, only once it has reaped the requests
  // whose handlers never return, seconds later. Nothing waits on that.
  graceful.catch(() => undefined);
  void Promise.resolve(server.stop(true)).catch(() => undefined);
}
