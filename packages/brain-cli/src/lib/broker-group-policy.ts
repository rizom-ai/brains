/**
 * When it is safe to start a second git broker.
 *
 * The broker owns a checkout. A surviving Git child of a dead broker can still
 * be writing to it, so starting a replacement beside one would put two writers
 * on one repository — the failure this whole design exists to remove.
 *
 * Absence therefore has to be *proven*, not assumed, and an unproven group
 * fails the entire runtime for external cleanup rather than being worked
 * around. Keeping that decision here, apart from the timers that enact it,
 * is what makes it something to read rather than infer.
 */

/** Just enough of `process.kill` to test a process group for existence. */
export type SignalProbe = (target: number, signal: 0) => void;

/**
 * Whether the broker's whole process group is gone.
 *
 * The pid is negated because that addresses the group rather than the leader —
 * signalling the positive pid would miss exactly the surviving children this
 * is looking for. Signal 0 asks whether it exists without touching it.
 *
 * Only `ESRCH` means absent. `EPERM` in particular means the group is there
 * and belongs to someone else, and reading that as absence would start the
 * second writer.
 */
export function isProcessGroupAbsent(kill: SignalProbe, pid: number): boolean {
  try {
    kill(-pid, 0);
    return false;
  } catch (error) {
    return (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "ESRCH"
    );
  }
}

export type BrokerReplacementStep =
  /** The group is gone; a replacement broker may take the checkout. */
  | { kind: "replace" }
  /** Still there, and attempts remain. */
  | { kind: "probe-again" }
  /** Still there with the budget spent; the runtime must stop. */
  | { kind: "give-up" };

/**
 * What to do after one probe.
 *
 * Proof wins over the budget: a group proven gone on the final attempt is
 * still proven gone, and the attempt count only bounds how long the supervisor
 * waits for an answer.
 */
export function brokerReplacementStep(
  groupAbsent: boolean,
  attempt: number,
  maxAttempts: number,
): BrokerReplacementStep {
  if (groupAbsent) return { kind: "replace" };
  if (attempt >= maxAttempts) return { kind: "give-up" };
  return { kind: "probe-again" };
}
