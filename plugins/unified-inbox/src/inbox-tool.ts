import {
  defineTool,
  z,
  type AnyServiceToolDefinition,
} from "@brains/sdk/services";
import type { InboxOperatorService } from "./operator-service";
import {
  inboxListFilterSchema,
  inboxListFilterShape,
  inboxListResultSchema,
  type InboxListResult,
} from "./schemas";

/**
 * The list, as a declared tool.
 *
 * `createAdminListTool` wrapped three things the declaration says outright:
 * the permission check is `permission`, the shape of the input is `input`,
 * and the success/failure envelope is the runtime's. What is left is the one
 * rule a shape cannot state — a facet filter without a source names nothing.
 */
export function inboxListTool(
  operator: Pick<InboxOperatorService, "list">,
): AnyServiceToolDefinition {
  return defineTool({
    // Scoped by the runtime to `unified-inbox_list`. The hand-registered
    // name was `inbox_list`, which named no plugin — every other package's
    // tools carry their package, and this one now does too.
    name: "list",
    description:
      "List live content-safe operator attention across registered inbox sources, optionally filtered by source, urgency, or source-declared facets",
    input: z.strictObject(inboxListFilterShape),
    output: inboxListResultSchema,
    permission: "admin",
    sideEffects: "none",
    execute: async ({ input }): Promise<InboxListResult> => {
      const filter = inboxListFilterSchema.safeParse(input);
      if (!filter.success) {
        throw new Error("Invalid unified inbox filters");
      }
      return operator.list(filter.data);
    },
  });
}
