import type { Tool } from "@brains/plugins";
import type { InboxOperatorService } from "./operator-service";
import {
  inboxListFilterSchema,
  inboxListFilterShape,
  inboxListToolOutputSchema,
  type InboxListToolOutput,
} from "./schemas";

export function createInboxListTool(
  operator: Pick<InboxOperatorService, "list">,
): Tool<InboxListToolOutput> {
  return {
    name: "inbox_list",
    description:
      "List live content-safe operator attention across registered inbox sources, optionally filtered by source or urgency",
    inputSchema: inboxListFilterShape,
    outputSchema: inboxListToolOutputSchema,
    visibility: "admin",
    sideEffects: "none",
    handler: async (rawInput, context): Promise<InboxListToolOutput> => {
      if (context.userPermissionLevel !== "admin") {
        return {
          success: false,
          error: "Unified inbox requires admin permission",
        };
      }
      const filter = inboxListFilterSchema.safeParse(rawInput);
      if (!filter.success) {
        return { success: false, error: "Invalid unified inbox filters" };
      }
      try {
        return {
          success: true,
          data: await operator.list(filter.data),
        };
      } catch {
        return { success: false, error: "Unified inbox list failed" };
      }
    },
  };
}
