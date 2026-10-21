/**
 * How long one surface/viewport/climate case may take. Passing CI runs take
 * 1.5s per case at the median and 6.3s at the slowest (the Dashboard), so this
 * leaves a slow runner twenty times the headroom. A browser call that never
 * returns now fails its case here instead of holding the job until CI cancels
 * it.
 */
export const CASE_DEADLINE_MS = 120_000;

/** Settle with `work`, or reject naming `description` once `ms` has passed. */
export async function withDeadline<T>(
  work: Promise<T>,
  ms: number,
  description: string,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const expired = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`${description} did not finish within ${ms}ms`)),
      ms,
    );
  });
  try {
    return await Promise.race([work, expired]);
  } finally {
    clearTimeout(timer);
  }
}
