import { createAdminListTool, type Tool } from "@brains/plugins";
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
  return createAdminListTool({
    name: "inbox_list",
    description:
      "List live content-safe operator attention across registered inbox sources, optionally filtered by source, urgency, or source-declared facets",
    inputSchema: inboxListFilterShape,
    filterSchema: inboxListFilterSchema,
    outputSchema: inboxListToolOutputSchema,
    errors: {
      permission: "Unified inbox requires admin permission",
      invalidFilter: "Invalid unified inbox filters",
      failed: "Unified inbox list failed",
    },
    list: (filter) => operator.list(filter),
  });
}
