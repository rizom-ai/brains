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
