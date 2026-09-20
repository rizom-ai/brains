/** Only pre-admission cancellation, never an uncertain submitted update. */
export class TargetUpdateCancelled extends Error {}
export function assertTargetLive(signal: AbortSignal): void {
  if (signal.aborted)
    throw new TargetUpdateCancelled(
      "Target update cancelled before admission",
      { cause: signal.reason },
    );
}
