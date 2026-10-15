/** Anything with the job queue's enqueue: the shell's queue or a jobs namespace. */
interface Enqueuer<TRequest> {
  enqueue(request: TRequest): Promise<string>;
}

export interface EnqueueRefusals {
  /** Enqueues refused so far. */
  readonly count: number;
}

/**
 * Refuse the next `count` enqueues the way the job queue does when another
 * process holds its write lock past the enqueue budget; later ones go through.
 */
export function refuseEnqueues<TRequest>(
  target: Enqueuer<TRequest>,
  count: number,
): EnqueueRefusals {
  const enqueue = target.enqueue.bind(target);
  const refusals = { count: 0 };
  target.enqueue = async (request: TRequest): Promise<string> => {
    if (refusals.count < count) {
      refusals.count += 1;
      throw new Error(
        "Failed to acquire atomic enqueue transaction within 2000ms",
      );
    }
    return enqueue(request);
  };
  return refusals;
}
