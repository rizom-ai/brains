import type { WatchState } from "../engine";

/** How often everything is compared while the brain cannot tell of changes itself. */
export const UNWATCHED_MINUTES = 5;

/**
 * Whether it is time to compare everything again. While the brain tells of
 * changes as they happen, the chosen time is a safety net. While it cannot
 * (an older brain, or one out of reach), comparing is the only way to see a
 * change, so it happens at least every five minutes.
 */
export function fullSyncDue(
  now: number,
  lastFullSync: number,
  chosenMinutes: number,
  watching: WatchState,
): boolean {
  const minutes =
    watching === "watching"
      ? chosenMinutes
      : Math.min(chosenMinutes, UNWATCHED_MINUTES);
  return now - lastFullSync >= minutes * 60_000;
}
