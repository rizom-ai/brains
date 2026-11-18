import {
  issuerFromRequest,
  isLoopbackIssuer,
  normalizeIssuer,
} from "@brains/plugins";
import type {
  ResolveAuthIdentityInput,
  VerifiedAccessToken,
} from "@brains/contracts";
import type {
  AuthAppPasswordGrant,
  AuthPrincipal,
  AuthIdentityAccessResolution,
  AuthBearerGrant,
} from "@brains/contracts";
import type { ActorRef } from "@brains/contracts";
import type { AppPasswordPersistence } from "./app-password-store";
import type { AuthAuditStore } from "./audit-store";
import type { AuthIdentityStore } from "./identity-store";
import type { AuthBrainAnchor, AuthUser } from "./runtime-schema";
import type {
  AuthSessionPersistence,
  AuthSessionRecord,
  CreateAuthSessionResult,
} from "./session-store";
import { getBearerToken, verifyAccessToken } from "./token-verifier";
import type { JwksResponse } from "./types";
import type { AuthUserStore } from "./user-store";

export interface AuthPrincipalServiceOptions {
  appPasswords: AppPasswordPersistence;
  audit: Pick<AuthAuditStore, "append">;
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
  private readonly appPasswords: AppPasswordPersistence;
  private readonly audit: Pick<AuthAuditStore, "append">;
  private readonly issuer: string;
  private readonly trustedIssuers: Set<string>;
  private readonly allowLocalhostIssuers: boolean;
  private readonly users: AuthUserStore;
  private readonly identities: AuthIdentityStore;
  private readonly sessions: AuthSessionPersistence;
  private readonly ensureFirstAdminUser: () => Promise<AuthUser>;
  private readonly getJwks: () => Promise<JwksResponse>;

  constructor(options: AuthPrincipalServiceOptions) {
    this.appPasswords = options.appPasswords;
    this.audit = options.audit;
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
    const sessionSubject = subject ?? (await this.ensureFirstAdminUser()).id;
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

  /**
   * The person behind a request's HTTP Basic app password. Basic credentials
   * travel on every request, so they are refused over plain HTTP anywhere but
   * loopback. The owner's standing is read on every call: a suspended or
   * public-level owner stops their app passwords at once.
   */
  async resolveAppPassword(
    request: Request,
  ): Promise<AuthAppPasswordGrant | undefined> {
    const credentials = getBasicCredentials(request);
    if (!credentials) return undefined;

    // No configured-issuer fallback: a request that does not say how it
    // arrived is judged by its own URL, never assumed to be HTTPS.
    const issuer = issuerFromRequest(request);
    if (!issuer.startsWith("https://") && !isLoopbackIssuer(issuer)) {
      return undefined;
    }

    const resolved = await this.appPasswords.resolve(
      credentials.username,
      credentials.password,
    );
    if (!resolved) return undefined;

    const user = await this.users.getUser(resolved.record.userId);
    if (user?.status !== "active" || user.role === "public") return undefined;

    if (resolved.firstUse) {
      await this.audit.append({
        actorUserId: user.id,
        action: "auth.app_password.first_used",
        targetType: "app_password",
        targetId: resolved.record.id,
      });
    }
    return {
      principal: await this.principalFromUser(user),
      access: resolved.record.access,
      appPasswordId: resolved.record.id,
    };
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

/** The username and password of an HTTP Basic `Authorization` header. */
function getBasicCredentials(
  request: Request,
): { username: string; password: string } | undefined {
  const match = /^Basic\s+([A-Za-z0-9+/]+={0,2})$/i.exec(
    request.headers.get("authorization")?.trim() ?? "",
  );
  if (!match?.[1]) return undefined;

  const decoded = Buffer.from(match[1], "base64").toString("utf8");
  const separator = decoded.indexOf(":");
  if (separator < 1) return undefined;
  return {
    username: decoded.slice(0, separator),
    password: decoded.slice(separator + 1),
  };
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
