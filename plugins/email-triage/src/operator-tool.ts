import type { Tool } from "@brains/plugins";
import type { MailTriageOperatorService } from "./operator-service";
import {
  mailTriageFilterSchema,
  mailTriageFilterShape,
  mailTriageListToolOutputSchema,
  type MailTriageListToolOutput,
} from "./schemas/operator";

export function createEmailTriageListTool(
  operator: MailTriageOperatorService,
): Tool<MailTriageListToolOutput> {
  return {
    name: "email_triage_list",
    description:
      "List safe derived email-triage items with combined category, priority, status, and reply filters",
    inputSchema: mailTriageFilterShape,
    outputSchema: mailTriageListToolOutputSchema,
    visibility: "admin",
    sideEffects: "none",
    handler: async (rawInput, context): Promise<MailTriageListToolOutput> => {
      if (context.userPermissionLevel !== "admin") {
        return {
          success: false,
          error: "Email triage requires admin permission",
        };
      }
      const parsed = mailTriageFilterSchema.safeParse(rawInput);
      if (!parsed.success) {
        return { success: false, error: "Invalid email triage filters" };
      }
      try {
        return {
          success: true,
          data: await operator.list(parsed.data),
        };
      } catch {
        return { success: false, error: "Email triage list failed" };
      }
    },
  };
}
