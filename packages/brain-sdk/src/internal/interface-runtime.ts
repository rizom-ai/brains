/**
 * Internal, first-party only: what a first-party interface converted from a
 * class needs and the public interface contract does not offer, reached with
 * `interfaceRuntime(context)` on a setup or slot context the brain built,
 * and the first-party declarations beside a public definition: a daemon as
 * its class registered it (`withDaemon`), a message transport the
 * runtime's message coordination sends through (`withMessageTransport`) and
 * the channels its class registered in every process (`withChannels`),
 * the HTTP routes it served as written (`withWebRoutes`), the tools it
 * registered under their names (`withTools`) and the protocol-only
 * registration it built of itself (`withProtocolPlugin`).
 * Each takes plain data and functions. Beside them, what its class imported
 * from the plugins package beside its base: the message helpers a reply is
 * planned, rendered and confirmed with, the upload policy and shared upload
 * store, artifact access, the HTTP and Agent Card helpers, and the shapes of
 * what its runtime reads and serves. No public entry exports this module.
 *
 * Tracked in docs/legacy-code-inventory.json (first-party-interface-runtime).
 */

export {
  interfaceRuntime,
  withChannels,
  withDaemon,
  withMessageTransport,
  withProtocolPlugin,
  withTools,
  withWebRoutes,
  type FirstPartyChannel,
  type FirstPartyChannelsContext,
  type FirstPartyDaemon,
  type FirstPartySlotContext,
  type InterfaceMessages,
  type InterfaceRuntime,
  type MessageTransport,
  type MessageTransportEdit,
  type MessageTransportSend,
  type ClassRuntimeState,
  type ClassRuntimeStateStore,
} from "@brains/plugins";
// A reply: its plan, approvals and confirmations, progress and tool statuses.
export {
  PendingApprovalTracker,
  buildApprovalResultView,
  buildConfirmationResponseParts,
  buildResponsePlan,
  formatApprovalRequestText,
  formatConfirmationResult,
  formatMessageProgressDisplay,
  formatPendingConfirmationHelp,
  formatPendingConfirmationsFallback,
  formatStructuredCardFallback,
  formatStructuredOutputSummary,
  formatToolStatusLabel,
  getConfirmationResultTitle,
  getPendingApprovalCards,
  getResolvedApprovalCard,
  getToolStatusDisplay,
  getToolStatusKey,
  parseConfirmationIntent,
  routeConfirmationResponse,
  type ApprovalResolution,
  type MessageInterfaceOutput,
  type ResponsePlan,
  type ToolStatusUpdate,
} from "@brains/plugins";
// A message: its input, attribution, stored metadata and the URLs it captures.
export {
  buildCoalescedInput,
  buildMessageActorMetadata,
  buildMessageSourceMetadata,
  captureUrlViaAgent,
  coerceConversationMetadata,
  extractCaptureableUrls,
  getStoredMessageAttachments,
  getStoredMessageCards,
  matchSpaceSelector,
  type ChatAttachment,
  type ChatContext,
  type ConversationMessageActor,
} from "@brains/plugins";
// Artifacts a reply carries, and who may receive them.
export {
  canReceiveNativeArtifactFile,
  collectDeniedArtifactCardIds,
  formatArtifactDisplay,
  formatContentDispositionHeader,
  getArtifactEntityFilename,
  parseArtifactDataUrl,
  resolveArtifactEntityRefFromCard,
  resolveMessageArtifactAccess,
  type MessageArtifactEntity,
} from "@brains/plugins";
// Uploads: the message upload policy and the shared upload store.
export {
  MessageUploadContinuity,
  RuntimeUploadStore,
  RuntimeUploadStoreError,
  defaultMessageUploadFilename,
  getMessageUploadKind,
  isLikelyUtf8Text,
  isMessageUploadDeclaredSizeAllowed,
  isMessageUploadSizeAllowed,
  isTextUploadSizeAllowed,
  isUploadableBinaryFile,
  isUploadableTextFile,
  messageBinaryUploadAccept,
  messageTextUploadAccept,
  messageTextUploadMaxBytes,
  messageUploadAccept,
  messageUploadMaxBytes,
  normalizeMessageUploadMediaType,
  normalizeTextUploadMediaType,
  redactUploadRefs,
  redactUploadRefsInStructuredCard,
  runtimeUploadIdPattern,
  sanitizeUploadFilename,
  validateMessageUpload,
  validateTextUpload,
  type InvalidUpload,
  type MessageUploadPolicyErrorCode,
  type MessageUploadValidationResult,
  type ResolvedRuntimeUpload,
  type RuntimeUploadRecord,
  type RuntimeUploadResponseBody,
  type RuntimeUploadScopeOptions,
  type RuntimeUploadStoreErrorCode,
  type SaveRuntimeUploadInput,
  type ScopedRuntimeUploadStore,
  type TextUploadValidationResult,
  type ValidateUploadInput,
  type ValidatedFileUpload,
  type ValidatedMessageUpload,
  type ValidatedTextUpload,
} from "@brains/plugins";
// HTTP routes, same-origin checks and the Agent Card.
export {
  ANCHOR_EXTENSION_URI,
  SitePageResponse,
  fetchVerifiedAgentCard,
  isEndpointRefusal,
  isLoopbackIssuer,
  issuerFromRequest,
  jsonResponse,
  requireSameOriginJson,
  requireSameOriginRequest,
  type PublicSkill,
  type WebRouteDefinition,
} from "@brains/plugins";
// What the runtime reads and serves: identity, permissions, tools, jobs,
// daemons and channel delivery.
export {
  FatalPluginConfigurationError,
  ToolVisibilitySchema,
  jobProgressChannel,
  permissionToVisibilityScope,
  resolveTextProvider,
  type AnchorProfile,
  type BatchJobStatus,
  type BrainCharacter,
  type ChannelDeliveryInput,
  type ContentVisibility,
  type DaemonHealth,
  type JobContext,
  type JobProgressEvent,
  type PermissionLookupContext,
  type ResolvedProfileKind,
  type Tool,
  type ToolInfo,
  type ToolResponse,
  type ToolVisibility,
} from "@brains/plugins";
// What the shared form pages and their HTTP intake are built with.
export {
  SITE_SLOT_ATTRIBUTE,
  type WebRouteTransportContext,
} from "@brains/plugins";
// The daemon an interface runs its scheduled maintenance as.
export { createScheduledMaintenanceDaemon } from "@brains/scheduler/maintenance";
