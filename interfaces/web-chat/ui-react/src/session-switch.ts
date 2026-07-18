export interface SessionSwitchRun<T> {
  load: () => Promise<T>;
  isCurrent: () => boolean;
  onSuccess: (value: T) => void;
  onError: (error: unknown) => void;
  onSettled: () => void;
}

/**
 * Apply a session load only while it is still the newest switch request.
 * Older requests may finish after a newer session is already visible; their
 * results, errors, and cleanup must not mutate the active session UI.
 */
export async function runSessionSwitch<T>(
  run: SessionSwitchRun<T>,
): Promise<void> {
  try {
    const value = await run.load();
    if (!run.isCurrent()) return;
    run.onSuccess(value);
  } catch (error) {
    if (!run.isCurrent()) return;
    run.onError(error);
  } finally {
    if (run.isCurrent()) run.onSettled();
  }
}
