/**
 * npm acknowledges a publish long before the registry serves the new version:
 * usually minutes, and over twenty minutes has been seen. Release verification
 * waits within this deadline for a version to appear.
 */
export const REGISTRY_PROPAGATION_DEADLINE_MS = 30 * 60_000;
const FIRST_RETRY_MS = 2_000;
const MAX_RETRY_MS = 60_000;

/** The registry does not serve the version yet; worth checking again. */
export class RegistryNotReady extends Error {}

export interface RegistryWaitOptions {
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  deadlineMs?: number;
}

/**
 * Run `check` until it succeeds. Only RegistryNotReady is retried, with the
 * delay doubling up to a minute, until the next check would pass the
 * deadline; any other failure is a real defect in what was published and
 * fails at once.
 */
export async function untilPublished<T>(
  check: () => Promise<T>,
  options: RegistryWaitOptions = {},
): Promise<T> {
  const now = options.now ?? Date.now;
  const sleep = options.sleep ?? Bun.sleep;
  const deadline =
    now() + (options.deadlineMs ?? REGISTRY_PROPAGATION_DEADLINE_MS);
  const attempt = async (count: number): Promise<T> => {
    try {
      return await check();
    } catch (error) {
      if (!(error instanceof RegistryNotReady)) throw error;
      const delay = Math.min(FIRST_RETRY_MS * 2 ** (count - 1), MAX_RETRY_MS);
      if (now() + delay > deadline) throw error;
      console.warn(
        `${error.message}; attempt ${count}, retrying in ${delay / 1_000}s`,
      );
      await sleep(delay);
      return attempt(count + 1);
    }
  };
  return attempt(1);
}
