export { InboxDataSource } from "./inbox-datasource";
export { InboxOperatorService } from "./operator-service";
export { createInboxListTool } from "./inbox-tool";
export { createUnifiedInboxDigest, registerUnifiedInboxDigest } from "./digest";
export { INBOX_ACTION_PATH, createInboxActionRoute } from "./action-route";
export {
  UnifiedInboxDashboardWidget,
  registerUnifiedInboxDashboardWidget,
} from "./dashboard-widget";
export { unifiedInboxWidgetScript } from "./dashboard-widget-script";
export { UnifiedInboxPlugin, unifiedInboxPlugin } from "./plugin";
export {
  inboxProjectionEntrySchema,
  inboxProjectionSchema,
  inboxSourceErrorSchema,
  inboxListFilterShape,
  inboxListFilterSchema,
  inboxListResultSchema,
  inboxActionRequestSchema,
  inboxActionConfirmationSchema,
  inboxActionCompletedSchema,
  inboxActionOutcomeSchema,
  inboxListToolOutputSchema,
  inboxDigestAlertSchema,
  type InboxProjection,
  type InboxProjectionEntry,
  type InboxSourceError,
  type InboxListFilter,
  type InboxListResult,
  type InboxActionRequest,
  type InboxActionOutcome,
  type InboxListToolOutput,
  type InboxDigestAlert,
} from "./schemas";
