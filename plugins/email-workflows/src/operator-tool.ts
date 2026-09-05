import {
  defineTool,
  type AnyServiceToolDefinition,
} from "@brains/sdk/services";
import { MailTriageOperatorService } from "./operator-service";
import {
  mailTriageFilterSchema,
  mailTriageListResultSchema,
  type MailTriageListResult,
} from "./schemas/operator";

/**
 * The triage list as a declared tool. Admin-only, read-only; the filter is
 * the input shape and the success envelope is the runtime's.
 */
export function emailTriageListTool(): AnyServiceToolDefinition {
  return defineTool({
    name: "triage-list",
    description:
      "List safe derived email-workflows items with combined category, priority, status, and reply filters",
    input: mailTriageFilterSchema,
    output: mailTriageListResultSchema,
    permission: "admin",
    sideEffects: "none",
    execute: ({
      input,
      entities,
      permissions,
    }): Promise<MailTriageListResult> =>
      new MailTriageOperatorService({ entities, permissions }).list(input),
  });
}
