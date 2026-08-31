import type {
  AppendAuthAuditEventInput,
  AuthAuditEvent,
  AuthAuditQuery,
  AuthAuditQueryResult,
} from "./audit-store";
import type { A2APrivateJwk } from "./types";
import type { A2APeerTrustRecord } from "./peer-trust-store";

/** The key this brain signs A2A requests with, and its published id. */
export interface A2ASigningKey {
  privateJwk: A2APrivateJwk;
  keyId: string;
}
import type { AuthBearerGrant, AuthPrincipal } from "./principal-service";

/**
 * Who a request is from.
 *
 * The one auth question almost every surface asks. Web-chat, dashboard and
 * studio resolve a session; MCP resolves a bearer grant; web-chat also needs
 * the login response for a request that carries neither. None of them needs
 * anything else auth knows, and typing them against the class said otherwise.
 *
 * Named consumers: @brains/web-chat, @brains/mcp, @brains/dashboard,
 * @brains/studio.
 */
export interface AuthCaller {
  resolveSession(request: Request): Promise<AuthPrincipal | undefined>;
  resolveBearerGrant(
    request: Request,
    options?: { issuer?: string; audience?: string },
  ): Promise<AuthBearerGrant | undefined>;
  createAuthLoginResponse(request: Request): Response;
}

/**
 * The audit trail.
 *
 * Writing an event and reading the trail are one surface: what studio
 * records is what administration queries, and splitting them would let the
 * two halves disagree about what an event is.
 *
 * Named consumers: @brains/studio (records), @brains/admin (records and
 * queries, via `AuthAdministration extends AuthAudit`).
 */
export interface AuthAudit {
  recordAuditEvent(input: AppendAuthAuditEventInput): Promise<AuthAuditEvent>;
  queryAuditEvents(query: AuthAuditQuery): Promise<AuthAuditQueryResult>;
}

/**
 * What this deployment is to its peers.
 *
 * Federation asks three things of auth: the issuer this brain speaks as, the
 * trust it has recorded for a peer domain, and the key it signs with. The
 * pure issuer helpers (`isLoopbackIssuer`, `issuerFromRequest`) stay free
 * functions beside this — they need no service.
 *
 * Named consumer: @brains/a2a.
 */
export interface AuthFederation {
  getIssuer(): string;
  getA2APeerTrust(domain: string): Promise<A2APeerTrustRecord | undefined>;
  getA2ASigningKey(): Promise<A2ASigningKey>;
}
