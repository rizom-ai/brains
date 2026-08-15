import { createAdminListTool, type Tool } from "@brains/plugins";
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
  return createAdminListTool({
    name: "email_triage_list",
    description:
      "List safe derived email-workflows items with combined category, priority, status, and reply filters",
    inputSchema: mailTriageFilterShape,
    filterSchema: mailTriageFilterSchema,
    outputSchema: mailTriageListToolOutputSchema,
    errors: {
      permission: "Email triage requires admin permission",
      invalidFilter: "Invalid email triage filters",
      failed: "Email triage list failed",
    },
    list: (filter) => operator.list(filter),
  });
}
