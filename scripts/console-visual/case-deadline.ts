/**
 * How long one surface/viewport/climate case may take. Passing CI runs take
 * 1.5s per case at the median and 6.3s at the slowest (the Dashboard), so this
 * leaves a slow runner twenty times the headroom. A stall outside any one
 * bounded browser call fails its case here instead of holding the job until CI
 * cancels it.
 */
export const CASE_DEADLINE_MS = 120_000;

/**
 * How long one browser call — a navigation, a page evaluation, a CDP command,
 * a screenshot — may take. The slowest calls in passing runs (a Studio page
 * load, up to 180 animation frames of scroll sampling) return within a few
 * seconds, so a call still pending after this is not slow but stuck: it fails
 * naming itself instead of leaving the case deadline to report only the case.
 */
export const PAGE_CALL_DEADLINE_MS = 30_000;

/** Work that was still pending when its deadline passed. */
export class DeadlineError extends Error {}

/** Settle with `work`, or reject naming `description` once `ms` has passed. */
export async function withDeadline<T>(
  work: Promise<T>,
  ms: number,
  description: string,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const expired = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () =>
        reject(
          new DeadlineError(`${description} did not finish within ${ms}ms`),
        ),
      ms,
    );
  });
  try {
    return await Promise.race([work, expired]);
  } finally {
    clearTimeout(timer);
  }
}
