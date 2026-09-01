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

/**
 * Where the running auth implementation is published.
 *
 * One registration per brain: auth-service registers itself when it comes
 * up and withdraws on shutdown, and a package reads what is there. A brain
 * with no auth-service reads `undefined` — which is the honest answer, and
 * the one a module-level global could not give a package that had already
 * imported it.
 */
export interface IAuthRegistry {
  register(implementation: AuthCaller & AuthAudit): void;
  unregister(implementation: AuthCaller & AuthAudit): void;
  getCaller(): AuthCaller | undefined;
  getAudit(): AuthAudit | undefined;
}

export class AuthRegistry implements IAuthRegistry {
  private implementation: (AuthCaller & AuthAudit) | undefined;

  public static createFresh(): AuthRegistry {
    return new AuthRegistry();
  }

  public register(implementation: AuthCaller & AuthAudit): void {
    if (
      this.implementation !== undefined &&
      this.implementation !== implementation
    ) {
      throw new Error("An auth implementation is already registered");
    }
    this.implementation = implementation;
  }

  public unregister(implementation: AuthCaller & AuthAudit): void {
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
}
