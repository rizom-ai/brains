import { guestInterfaceType } from "@brains/contracts/chat";
import type { ToolContext } from "@brains/mcp-service";

/**
 * A guest reads like any public user: the caller's permission level already
 * scopes it to public entities. Only the guest's own identity is checked here,
 * since transport routing never accepts it from browser or tool arguments.
 */
export function assertGuestReader(context: ToolContext): void {
  if (context.interfaceType !== guestInterfaceType) return;
  if (context.userPermissionLevel !== "public" || context.isAnchor)
    throw new Error("Guest execution denied");
}
