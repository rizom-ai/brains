import { withProcessRole } from "@brains/utils/logger";
import type { CommandResult } from "./command-result";

/**
 * Print what a command ended with and return its exit status.
 *
 * This is the CLI's own output, not a log line, so it goes through no logger;
 * in a supervised child it is still that child's startup failure, so it names
 * the child's role like every other line the child writes.
 */
export function printCommandResult(
  result: CommandResult,
  out: Pick<Console, "log" | "error"> = console,
): number {
  if (!result.success) {
    if (result.message) out.error(withProcessRole(result.message));
    return result.exitCode ?? 1;
  }
  if (result.message) out.log(withProcessRole(result.message));
  return 0;
}
