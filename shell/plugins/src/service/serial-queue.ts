/**
 * Runs async operations one at a time, in call order.
 *
 * Read-modify-write against a persistent store needs the read and the write to
 * be one indivisible step, or concurrent callers silently lose each other's
 * updates. A rejected operation propagates to its own caller but never wedges
 * the queue.
 */
export class SerialQueue {
  private tail: Promise<void> = Promise.resolve();

  /** Queue `operation`, resolving with its result once earlier work finishes. */
  run<R>(operation: () => R | Promise<R>): Promise<R> {
    const result = this.tail.then(() => operation());
    this.tail = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  /** Wait for everything queued so far to finish, successfully or not. */
  async settle(): Promise<void> {
    await this.tail;
  }
}
