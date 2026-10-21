import { useEffect, useState } from "react";

const STOP_WAITING_AFTER_MS = 20_000;

/**
 * Whether to offer to stop waiting: an answer is being written and has taken
 * longer than `afterMs`. The wait starts over with every answer.
 */
export function useStopWaitingOffer(
  waiting: boolean,
  afterMs: number = STOP_WAITING_AFTER_MS,
): boolean {
  const [patient, setPatient] = useState(false);
  useEffect(() => {
    setPatient(false);
    if (!waiting) return;
    const timer = window.setTimeout(() => setPatient(true), afterMs);
    return (): void => window.clearTimeout(timer);
  }, [waiting, afterMs]);
  return waiting && patient;
}
