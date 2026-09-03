/** A durable enqueue request that cannot become valid by retrying unchanged. */
export class PermanentJobEnqueueError extends Error {
  public readonly code = "JOB_ENQUEUE_PERMANENT";

  public constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "PermanentJobEnqueueError";
  }
}

export function isPermanentJobEnqueueError(
  error: unknown,
): error is PermanentJobEnqueueError {
  return error instanceof PermanentJobEnqueueError;
}
