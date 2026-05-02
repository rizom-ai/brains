/**
 * Serializes git operations so commit/push/pull tasks do not race each other.
 */
export class GitOperationLock {
  private queue: Promise<void> = Promise.resolve();

  run<T>(fn: () => Promise<T>): Promise<T> {
    let resolve: (() => void) | undefined;
    const next = new Promise<void>((r) => {
      resolve = r;
    });
    const prev = this.queue;
    this.queue = next;
    return prev.then(async () => {
      try {
        return await fn();
      } finally {
        resolve?.();
      }
    });
  }
}
