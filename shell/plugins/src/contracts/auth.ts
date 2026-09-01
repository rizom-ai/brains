import type { JsonObject } from "@brains/contracts";

/**
 * What a package may ask auth, and the vocabulary those questions use.
 *
 * The contracts live here rather than in `@brains/auth-service` because a
 * package has to be able to *name* them without depending on the service
 * that implements them — and it cannot depend on it: auth-service is itself
 * a service plugin built on this package's context, so the arrow only runs
 * one way. auth-service imports these and implements them nominally, which
 * is what keeps the class and the contract from drifting apart silently.
 */

/** Who a request is from. */
export interface AuthPrincipal {
  userId: string;
  personId: string;
  displayName: string;
  role: "admin" | "trusted" | "public";
  status: "active" | "invited" | "suspended";
  permissionLevel: "admin" | "trusted" | "public";
  isAnchor: boolean;
  canonicalId?: string;
}

/**
 * A verified bearer token.
 *
 * `claims` is the decoded payload. It stays an open record here: the
 * verifier decodes it with a JWT library, and nothing a package does with
 * the claims needs that library's type.
 */
export interface VerifiedAccessToken {
  subject: string;
  issuer: string;
  audience: string | string[] | undefined;
  scope: string[];
  claims: Record<string, unknown>;
}

export interface AuthBearerGrant {
  principal: AuthPrincipal;
  token: VerifiedAccessToken;
}

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

export interface AppendAuthAuditEventInput {
  actorUserId?: string;
  action: string;
  targetType?: string;
  targetId?: string;
  metadata?: Record<string, unknown>;
}

export interface AuthAuditEvent {
  id: string;
  actorUserId?: string;
  action: string;
  targetType?: string;
  targetId?: string;
  metadata?: Record<string, unknown>;
  createdAt: number;
}

export interface AuthAuditQuery {
  actorUserId?: string | undefined;
  action?: string | undefined;
  selectedId?: string | undefined;
  offset: number;
  limit: number;
}

export interface AuthAuditActionCount {
  action: string;
  count: number;
}

export interface AuthAuditQueryResult {
  events: AuthAuditEvent[];
  selectedEvent?: AuthAuditEvent | undefined;
  actions: AuthAuditActionCount[];
  total: number;
}

/**
 * The audit trail.
 *
 * Writing an event and reading the trail are one surface: what studio
 * records is what administration queries, and splitting them would let the
 * two halves disagree about what an event is.
 *
 * Named consumers: @brains/studio (records), @brains/admin (records and
 * queries).
 */
export interface AuthAudit {
  recordAuditEvent(input: AppendAuthAuditEventInput): Promise<AuthAuditEvent>;
  queryAuditEvents(query: AuthAuditQuery): Promise<AuthAuditQueryResult>;
}

export interface GrantA2APeerTrustInput {
  domain: string;
  keyFingerprint: string;
  grantedLevel: "public" | "trusted" | "admin";
}

/** Who is granting or revoking, for the audit trail. */
export interface PeerTrustMutationContext {
  actorUserId?: string;
}

/** A peer domain this brain has recorded trust for. */
export interface A2APeerTrustRecord {
  domain: string;
  keyFingerprint: string;
  grantedLevel: "public" | "trusted";
}

export interface A2APublicJwk extends JsonObject {
  kty: "OKP";
  crv: "Ed25519";
  x: string;
  kid: string;
  use: "sig";
  alg: "EdDSA";
}

export interface A2APrivateJwk extends A2APublicJwk {
  d: string;
}

/** The key this brain signs A2A requests with, and its published id. */
export interface A2ASigningKey {
  privateJwk: A2APrivateJwk;
  keyId: string;
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
  /**
   * Trusting a peer is an act someone performs, so it is attributed. Named
   * consumer: @brains/agent-discovery, whose set-trust tool grants after the
   * person confirms and pins the key the peer publishes at that moment.
   */
  grantA2APeerTrust(
    input: GrantA2APeerTrustInput,
    context?: PeerTrustMutationContext,
  ): Promise<A2APeerTrustRecord>;
  revokeA2APeerTrust(
    domain: string,
    context?: PeerTrustMutationContext,
  ): Promise<void>;
}

/**
 * Where the running auth implementation is published.
 *
 * One registration per brain: auth-service registers itself when it comes
 * up and withdraws on shutdown, and a package reads what is there. A brain
 * with no auth-service reads `undefined` — which is the honest answer, and
 * the one a module-level global could not give a package that had already
 * imported it.
 */
/** Everything the runtime publishes as one object. */
/**
 * Resolving a speaker who arrives on a channel rather than over HTTP.
 *
 * A chat message carries a platform identity, not a request with a session,
 * so `AuthCaller` cannot answer for it. Named consumer: @brains/chat, which
 * prefers a linked brain account over the interface's own permission rules.
 */
export interface AuthIdentities {
  resolveIdentityAccess(input: {
    type: string;
    subject: string;
  }): Promise<
    | { state: "resolved"; principal: AuthPrincipal }
    | { state: "denied" }
    | { state: "unbound" }
  >;
}

export type AuthImplementation = AuthCaller &
  AuthAudit &
  AuthFederation &
  AuthIdentities;

export interface IAuthRegistry {
  register(implementation: AuthImplementation): void;
  unregister(implementation: AuthImplementation): void;
  getCaller(): AuthCaller | undefined;
  getAudit(): AuthAudit | undefined;
  getFederation(): AuthFederation | undefined;
  getIdentities(): AuthIdentities | undefined;
}

export class AuthRegistry implements IAuthRegistry {
  private implementation: AuthImplementation | undefined;

  public static createFresh(): AuthRegistry {
    return new AuthRegistry();
  }

  public register(implementation: AuthImplementation): void {
    if (
      this.implementation !== undefined &&
      this.implementation !== implementation
    ) {
      throw new Error("An auth implementation is already registered");
    }
    this.implementation = implementation;
  }

  public unregister(implementation: AuthImplementation): void {
    if (this.implementation === implementation) {
      this.implementation = undefined;
    }
  }

  public getCaller(): AuthCaller | undefined {
    return this.implementation;
  }

  public getAudit(): AuthAudit | undefined {
    return this.implementation;
  }

  public getFederation(): AuthFederation | undefined {
    return this.implementation;
  }

  public getIdentities(): AuthIdentities | undefined {
    return this.implementation;
  }
}
