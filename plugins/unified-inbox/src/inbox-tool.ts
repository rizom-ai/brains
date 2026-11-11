import { SdkError, z } from "@brains/sdk/services";
import {
  firstPartyTool,
  type ServiceRuntime,
} from "@brains/sdk/internal/service-runtime";
import type { InboxOperatorService } from "./operator-service";
import {
  inboxListFilterSchema,
  inboxListFilterShape,
  inboxListResultSchema,
} from "./schemas";

// Loose, so a key the filter does not know reaches the filter's own strict
// check and is refused there, as the class refused it.
const inboxListInputSchema: z.ZodObject<
  typeof inboxListFilterShape,
  z.core.$loose
> = z.looseObject(inboxListFilterShape);

/**
 * `inbox_list`, under the bare name its class registered it by: the live,
 * content-safe Inbox for an admin, filtered by source, urgency or the
 * source's facets. A caller below admin is refused before any source is
 * read, as the class refused one from the call.
 */
export function inboxListTool(
  operator: Pick<InboxOperatorService, "list">,
  runtime: Pick<ServiceRuntime, "toolCall">,
): ReturnType<
  typeof firstPartyTool<
    "inbox_list",
    typeof inboxListInputSchema,
    typeof inboxListResultSchema
  >
> {
  return firstPartyTool(
    {
      name: "inbox_list",
      description:
        "List live content-safe operator attention across registered inbox sources, optionally filtered by source, urgency, or source-declared facets",
      input: inboxListInputSchema,
      output: inboxListResultSchema,
      permission: "admin",
      sideEffects: "none",
      execute: async ({ input }) => {
        if (runtime.toolCall()?.userPermissionLevel !== "admin") {
          throw new SdkError("permission_denied", {
            publicMessage: "Unified inbox requires admin permission",
          });
        }
        const filter = inboxListFilterSchema.safeParse(input);
        if (!filter.success) {
          throw new SdkError("invalid_input", {
            publicMessage: "Invalid unified inbox filters",
          });
        }
        try {
          return await operator.list(filter.data);
        } catch (error) {
          // A source's failure stays with the brain: the caller is told the
          // list failed, as the class told it, never why.
          throw new SdkError("handler_failed", {
            publicMessage: "Unified inbox list failed",
            cause: error,
          });
        }
      },
    },
    { bareName: true },
  );
}
