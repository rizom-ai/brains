import {
  guestExecutionPolicySchema,
  guestInterfaceType,
} from "@brains/contracts/chat";
import type { ToolContext } from "@brains/mcp-service";
import type { EntityReadOptions } from "@brains/entity-service";

/** Transport routing never accepts this policy from browser/tool arguments. */
export function guestReadOptions(context: ToolContext): EntityReadOptions {
  if (context.interfaceType !== guestInterfaceType) {
    if (context.guestExecution !== undefined)
      throw new Error("Guest execution scope mismatch");
    return {};
  }
  const execution = guestExecutionPolicySchema.safeParse(
    context.guestExecution,
  );
  if (
    !execution.success ||
    context.userPermissionLevel !== "public" ||
    context.isAnchor ||
    !(context.signal instanceof AbortSignal)
  )
    throw new Error("Guest execution denied");
  context.signal.throwIfAborted();
  return {
    readBudget: execution.data.limits.retrieval,
    signal: context.signal,
  };
}
