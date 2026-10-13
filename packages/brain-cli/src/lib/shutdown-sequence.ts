import type { CommandResult } from "./command-result";

/**
 * When the supervisor is allowed to say how the runtime ended.
 *
 * Three things have to line up before there is an answer: every child has
 * actually exited, and either something recorded why the runtime is stopping
 * or someone asked it to stop. Children being gone is not on its own a reason
 * — the supervisor tears down on several paths, and on each of them the
 * handler that started the teardown is the one that knows the outcome.
 */
export type SupervisorConclusion =
  /** Nothing to resolve yet; either a child is alive or no one said why. */
  | { kind: "pending" }
  /** The runtime is over, with this result. */
  | { kind: "resolve"; result: CommandResult };

/**
 * A failure recorded earlier wins over the shutdown that followed it.
 *
 * Every terminal failure stops the children as its next move, so by the time
 * they are gone the shutdown flag is set too. Reading that flag first would
 * report success for every failure the supervisor handles.
 */
export function supervisorConclusion(
  childrenRunning: number,
  finalResult: CommandResult | undefined,
  parentShutdownRequested: boolean,
): SupervisorConclusion {
  if (childrenRunning > 0) return { kind: "pending" };
  if (finalResult) return { kind: "resolve", result: finalResult };
  if (parentShutdownRequested) {
    return { kind: "resolve", result: { success: true } };
  }
  return { kind: "pending" };
}
