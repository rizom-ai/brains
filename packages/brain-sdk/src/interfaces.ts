/** Declarative public interface authoring contract. */

export {
  defineAccountSettings,
  defineDaemon,
  defineInterface,
  defineMessageInterface,
  defineSubscription,
  defineRoute,
  protocol,
  // A route hosting somebody else's protocol answers for itself: the event
  // stream, status code and session headers its clients read are not this
  // interface's to reshape. Named consumer: @brains/mcp.
  verbatim,
} from "@brains/plugins";
export type { RouteResponse, VerbatimResponse } from "@brains/plugins";

// Tools an interface offers of its own — not the tools it serves, which come
// from every other package, but the ones with no meaning without a client on
// the other end. Named consumer: @brains/mcp.
export { defineTool } from "@brains/plugins";
export type {
  AnyServiceToolDefinition,
  ServiceToolDefinition,
} from "@brains/plugins";

// The runtime's protocol server, which `setup` already hands a protocol host
// — named here so a declaration can say what it holds onto between
// registration and the daemon that drives it. Named consumer: @brains/mcp.
export type { IMCPTransport } from "@brains/plugins";

// What every interface can ask for at registration — both families get the
// same context, because they are the same kind of thing.
export type {
  InterfaceEntityReader,
  InterfaceJobs,
  InterfaceJobStatus,
  InterfaceSetupContext,
} from "@brains/plugins";
// The conversation surface an interface hosts one through — listing threads,
// reading a history back, renaming, deleting.
// Named consumers: @brains/web-chat, @brains/chat.
export type { IInterfaceConversationsNamespace } from "@brains/plugins";

// Somewhere to put bytes that arrived from outside — the same reason
// `runtimeState` exists, for content rather than bookkeeping. The runtime owns
// the store and its retention; the declaration names a scope, and the runtime
// files it under the declaration's own id so two interfaces cannot read each
// other's. Named consumers: @brains/web-chat, @brains/chat.
export type {
  InterfaceUploads,
  ResolvedRuntimeUpload,
  RuntimeUploadRecord,
  RuntimeUploadResponseBody,
  RuntimeUploadScopeOptions,
  SaveRuntimeUploadInput,
  ScopedRuntimeUploadStore,
} from "@brains/plugins";
// What the store refuses, and why. An interface serving upload endpoints has
// to tell a missing file from a malformed ref to answer with the right status,
// and the alternative is matching on message text.
export { RuntimeUploadStoreError } from "@brains/plugins";
export type { RuntimeUploadStoreErrorCode } from "@brains/plugins";

// A file on its way to or from the agent. An interface that accepts an
// attachment builds one of these, and one that serves a download names the
// file in the header browsers read it from.
// Named consumers: @brains/web-chat, @brains/chat.
export { formatContentDispositionHeader } from "@brains/plugins";
export type { ChatAttachment } from "@brains/plugins";
export type {
  AccountSettingsDefinition,
  AccountSettingsFieldDefinition,
  AccountSettingsValue,
} from "@brains/plugins";
export { UserPermissionLevelSchema } from "@brains/templates";
export type { UserPermissionLevel } from "@brains/templates";
export { z } from "@brains/utils/zod";

// The durable store `setup` hands an interface, so a declaration can hold one.
// Named consumer: @brains/email, which keeps an IMAP cursor.
export type { IRuntimeStateStore } from "@brains/plugins";

// A tool that *is* the conversation rather than a capability within one: it
// puts a message to the brain, and the brain can ask something back. Only a
// tool declaring `agentTool: false` reaches it, because the agent calling a
// tool that calls the agent is a loop with no base case.
// Named consumer: @brains/mcp.
export type { ToolAgent, ToolAgentAnswer, ToolAsk } from "@brains/plugins";

// Who a request is from, and what this deployment is to its peers. An
// interface that serves HTTP resolves its caller before acting — a session
// (web-chat), a bearer grant (mcp) — and federation asks the issuer, the
// recorded peer trust, and the signing key (a2a). The issuer helpers are
// pure: they answer from the string or the request, and need no service.
// All contracts are type-only; the instance arrives through the runtime.
// Named consumers: @brains/web-chat, @brains/mcp, @brains/chat, @brains/a2a.
export { isLoopbackIssuer, issuerFromRequest } from "@brains/auth-service";
export type {
  AuthBearerGrant,
  AuthCaller,
  AuthFederation,
  AuthPrincipal,
} from "@brains/auth-service";

// How an answer reads on this channel. The runtime decides what an answer is
// made of and in what order — `present` receives that as directives — but a
// terminal spells an approval out and a web client draws a card, so the
// formatting helpers that are genuinely shared are published here and the
// rest stays with whoever renders it.
// Named consumers: @brains/chat-repl, @brains/chat, @brains/web-chat.
export {
  buildApprovalResultView,
  formatApprovalRequestText,
  formatStructuredCardFallback,
  getPendingApprovalCards,
  getResolvedApprovalCard,
} from "@brains/plugins";
export type {
  ApprovalResolution,
  ResponseRenderDirective,
  StructuredChatCard,
  ToolApprovalCard,
} from "@brains/plugins";

// The rest of that vocabulary, for an interface that renders a whole
// conversation rather than one reply: what a stored message carried, what an
// artifact is called and who may fetch it, how progress and tool activity
// read, and what must not leak when a card is shown again.
//
// All of it is derivation over shapes the runtime already defines — no service
// reaches through here. It is published because two interfaces must not
// disagree about what a stored message contained or who may open its
// attachment, and because deriving it twice is how they would.
// Named consumers: @brains/web-chat, @brains/chat.
export {
  coerceConversationMetadata,
  formatMessageProgressDisplay,
  getArtifactEntityFilename,
  getStoredMessageAttachments,
  getStoredMessageCards,
  getToolStatusDisplay,
  parseArtifactDataUrl,
  redactUploadRefs,
  redactUploadRefsInStructuredCard,
  resolveMessageArtifactAccess,
} from "@brains/plugins";
export type {
  JobContext,
  JobProgressEvent,
  MessageArtifactEntity,
  ResponsePlan,
  ToolStatusUpdate,
} from "@brains/plugins";
