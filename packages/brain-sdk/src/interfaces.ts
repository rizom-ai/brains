/** Declarative public interface authoring contract. */

export {
  defineAccountSettings,
  defineDaemon,
  defineInterface,
  defineMessageInterface,
  defineSubscription,
  defineRoute,
  protocol,
} from "@brains/plugins";
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
