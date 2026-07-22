import type { ActorRef } from "@brains/contracts";
import type {
  AuthIdentityStore,
  ResolveAuthIdentityInput,
} from "./identity-store";
import { issuerFromRequest, isLoopbackIssuer, normalizeIssuer } from "./issuer";
import type { AuthBrainAnchor, AuthUser } from "./runtime-schema";
import type {
  AuthSessionPersistence,
  AuthSessionRecord,
  CreateAuthSessionResult,
} from "./session-store";
import { getBearerToken, verifyAccessToken } from "./token-verifier";
import type { VerifiedAccessToken } from "./token-verifier";
import type { JwksResponse } from "./types";
import type { AuthUserStore } from "./user-store";

const LEGACY_SINGLE_OPERATOR_SUBJECT = "single-operator";

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

export type AuthIdentityAccessResolution =
  | { state: "resolved"; principal: AuthPrincipal }
  | { state: "denied" }
  | { state: "unbound" };

export interface AuthBearerGrant {
  principal: AuthPrincipal;
  token: VerifiedAccessToken;
}

export interface AuthPrincipalServiceOptions {
  issuer: string;
  trustedIssuers: Iterable<string>;
  allowLocalhostIssuers: boolean;
  users: AuthUserStore;
  identities: AuthIdentityStore;
  sessions: AuthSessionPersistence;
  ensureFirstAdminUser: () => Promise<AuthUser>;
  getJwks: () => Promise<JwksResponse>;
}

export class AuthPrincipalService {
  private readonly issuer: string;
  private readonly trustedIssuers: Set<string>;
  private readonly allowLocalhostIssuers: boolean;
  private readonly users: AuthUserStore;
  private readonly identities: AuthIdentityStore;
  private readonly sessions: AuthSessionPersistence;
  private readonly ensureFirstAdminUser: () => Promise<AuthUser>;
  private readonly getJwks: () => Promise<JwksResponse>;

  constructor(options: AuthPrincipalServiceOptions) {
    this.issuer = options.issuer;
    this.trustedIssuers = new Set(options.trustedIssuers);
    this.allowLocalhostIssuers = options.allowLocalhostIssuers;
    this.users = options.users;
    this.identities = options.identities;
    this.sessions = options.sessions;
    this.ensureFirstAdminUser = options.ensureFirstAdminUser;
    this.getJwks = options.getJwks;
  }

  async principalFromUser(user: AuthUser): Promise<AuthPrincipal> {
    return principalFromUser(user, await this.users.getBrainAnchor());
  }

  async resolveActor(actor: ActorRef): Promise<AuthPrincipal | undefined> {
    if (actor.kind === "user") {
      const user = await this.users.getUser(actor.userId);
      return user?.status === "active"
        ? this.principalFromUser(user)
        : undefined;
    }
    if (actor.kind !== "external") return undefined;

    const identityKeyHash = actor.externalActorId.startsWith("ext_")
      ? actor.externalActorId.slice("ext_".length)
      : "";
    if (!/^[a-f0-9]{64}$/.test(identityKeyHash)) return undefined;
    const result =
      await this.identities.resolveIdentityHashAccess(identityKeyHash);
    return result.state === "resolved"
      ? this.principalFromUser(result.user)
      : undefined;
  }

  /**
   * Compatibility-only projection for identity enrichment.
   *
   * @deprecated Use `resolveIdentityAccess()` for every authorization decision.
   * This helper intentionally returns `undefined` for both denied and unbound
   * identities, so callers must never use it before a permission-rule fallback.
   */
  async resolveIdentity(
    input: ResolveAuthIdentityInput,
  ): Promise<AuthPrincipal | undefined> {
    const result = await this.resolveIdentityAccess(input);
    return result.state === "resolved" ? result.principal : undefined;
  }

  async resolveIdentityAccess(
    input: ResolveAuthIdentityInput,
  ): Promise<AuthIdentityAccessResolution> {
    const result = await this.identities.resolveIdentityAccess(input);
    return result.state === "resolved"
      ? {
          state: "resolved",
          principal: await this.principalFromUser(result.user),
        }
      : result;
  }

  async createSession(
    subject?: string,
    options: { secure?: boolean } = {},
  ): Promise<CreateAuthSessionResult> {
    const sessionSubject =
      !subject || subject === LEGACY_SINGLE_OPERATOR_SUBJECT
        ? (await this.ensureFirstAdminUser()).id
        : subject;
    return this.sessions.createSession(sessionSubject, options);
  }

  getSession(request: Request): Promise<AuthSessionRecord | undefined> {
    return this.sessions.getSessionFromRequest(request);
  }

  async resolveActiveSession(
    request: Request,
  ): Promise<{ session: AuthSessionRecord; user: AuthUser } | undefined> {
    const session = await this.getSession(request);
    if (!session) return undefined;

    const user = await this.users.getUser(session.subject);
    return user?.status === "active" ? { session, user } : undefined;
  }

  async resolveSession(request: Request): Promise<AuthPrincipal | undefined> {
    const resolved = await this.resolveActiveSession(request);
    return resolved ? this.principalFromUser(resolved.user) : undefined;
  }

  async verifyBearerToken(
    request: Request,
    options: { issuer?: string; audience?: string } = {},
  ): Promise<VerifiedAccessToken | undefined> {
    const token = getBearerToken(request);
    if (!token) return undefined;

    const issuer = options.issuer
      ? normalizeIssuer(options.issuer)
      : this.resolveRequestIssuer(request);

    return verifyAccessToken(token, await this.getJwks(), {
      issuer,
      ...(options.audience ? { audience: options.audience } : {}),
    });
  }

  async resolveBearerGrant(
    request: Request,
    options: { issuer?: string; audience?: string } = {},
  ): Promise<AuthBearerGrant | undefined> {
    const token = await this.verifyBearerToken(request, options);
    if (!token) return undefined;

    const user = await this.users.getUser(token.subject);
    return user?.status === "active"
      ? { principal: await this.principalFromUser(user), token }
      : undefined;
  }

  async resolveBearerToken(
    request: Request,
    options: { issuer?: string; audience?: string } = {},
  ): Promise<AuthPrincipal | undefined> {
    return (await this.resolveBearerGrant(request, options))?.principal;
  }

  resolveRequestIssuer(request: Request): string {
    const requestIssuer = issuerFromRequest(request, this.issuer);
    if (
      this.trustedIssuers.has(requestIssuer) ||
      (this.allowLocalhostIssuers && isLoopbackIssuer(requestIssuer))
    ) {
      return requestIssuer;
    }

    throw new Error(
      `Request issuer ${requestIssuer} is not in trusted issuers`,
    );
  }
}

export function principalFromUser(
  user: AuthUser,
  anchor: AuthBrainAnchor | undefined,
): AuthPrincipal {
  return {
    userId: user.id,
    personId: user.personId,
    displayName: user.displayName,
    role: user.role,
    status: user.status,
    permissionLevel: user.role,
    isAnchor: anchor?.kind === "person" && anchor.subjectId === user.personId,
    ...(user.canonicalId ? { canonicalId: user.canonicalId } : {}),
  };
}
