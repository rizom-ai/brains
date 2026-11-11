export { default } from "./plugin";
export { InboxDataSource } from "./inbox-datasource";
export { InboxOperatorService } from "./operator-service";
export { inboxListTool } from "./inbox-tool";
export { createUnifiedInboxDigest, registerUnifiedInboxDigest } from "./digest";
export { inboxWidget, loadInboxWidget } from "./dashboard-widget";
export {
  inboxWorkspace,
  loadInboxWorkspace,
  prepareInboxAction,
  runInboxAction,
  runInboxActionFor,
  type InboxActionInput,
  type InboxWorkspaceData,
} from "./operator-studio";
export {
  inboxProjectionSchema,
  inboxListFilterShape,
  inboxListFilterSchema,
  inboxListItemSchema,
  inboxListEntrySchema,
  inboxListResultSchema,
  inboxWorkspaceQuerySchema,
  inboxWorkspaceEntrySchema,
  inboxWorkspaceSnapshotSchema,
  inboxDashboardDataSchema,
  inboxActionRequestSchema,
  inboxActionOutcomeSchema,
  inboxDetailRequestSchema,
  inboxDetailOutcomeSchema,
  inboxListToolOutputSchema,
  type InboxProjection,
  type InboxProjectionEntry,
  type InboxSourceError,
  type InboxListFilter,
  type InboxListEntry,
  type InboxListResult,
  type InboxWorkspaceQuery,
  type InboxWorkspaceEntry,
  type InboxSourceAvailability,
  type InboxWorkspaceSnapshot,
  type InboxDashboardData,
  type InboxActionRequest,
  type InboxActionOutcome,
  type InboxDetailRequest,
  type InboxDetailOutcome,
  type InboxListToolOutput,
  type InboxDigestAlert,
} from "./schemas";
