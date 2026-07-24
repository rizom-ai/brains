import { sha256Base64Url } from "@brains/utils/hash";
import type {
  PublicKeyCredentialCreationOptionsJSON,
  RegistrationResponseJSON,
} from "@simplewebauthn/server";
import type {
  AuthAccountConnectedChannel,
  AuthAccountPasskey,
  AuthAccountSnapshot,
  AuthAccountSessionSummary,
} from "./account-contracts";
import type { AuthAuditStore } from "./audit-store";
import type { AuthCredentialStore, StoredPasskey } from "./credential-store";
import type { AuthIdentityRecord, AuthIdentityStore } from "./identity-store";
import type { PasskeyService, WebAuthnRequestContext } from "./passkey-service";
import type { RuntimeRefreshTokenStore } from "./refresh-token-store";
import type {
  AuthSessionRecord,
  RuntimeAuthSessionStore,
} from "./session-store";
import type { AuthUser } from "./runtime-schema";
import type { AuthUserStore } from "./user-store";

export interface AuthAccountContext {
  userId: string;
  sessionId: string;
}

export interface AuthAccountServiceOptions {
  users: AuthUserStore;
  identities: AuthIdentityStore;
  credentials: AuthCredentialStore;
  sessions: RuntimeAuthSessionStore;
  refreshTokens: RuntimeRefreshTokenStore;
  passkeys: PasskeyService;
  audit: AuthAuditStore;
}

export class AuthAccountService {
  private readonly users: AuthUserStore;
  private readonly identities: AuthIdentityStore;
  private readonly credentials: AuthCredentialStore;
  private readonly sessions: RuntimeAuthSessionStore;
  private readonly refreshTokens: RuntimeRefreshTokenStore;
  private readonly passkeys: PasskeyService;
  private readonly audit: AuthAuditStore;

  constructor(options: AuthAccountServiceOptions) {
    this.users = options.users;
    this.identities = options.identities;
    this.credentials = options.credentials;
    this.sessions = options.sessions;
    this.refreshTokens = options.refreshTokens;
    this.passkeys = options.passkeys;
    this.audit = options.audit;
  }

  async getSnapshot(context: AuthAccountContext): Promise<AuthAccountSnapshot> {
    const user = await this.requireActiveUser(context.userId);
    const [identities, passkeys, sessions] = await Promise.all([
      this.identities.listIdentities(user.id),
      this.credentials.listPasskeys(user.id),
      this.sessions.listActiveSessionsForSubject(user.id),
    ]);
    return {
      displayName: user.displayName,
      role: user.role,
      passkeys: passkeys.map(passkeySummary),
      connectedChannels: identities.flatMap(connectedChannelSummary),
      sessions: sessions.map((session) =>
        sessionSummary(session, context.sessionId),
      ),
    };
  }

  async updateDisplayName(
    context: AuthAccountContext,
    displayName: string,
  ): Promise<AuthAccountSnapshot> {
    await this.requireActiveUser(context.userId);
    await this.users.updateDisplayName(context.userId, displayName);
    await this.audit.append({
      actorUserId: context.userId,
      action: "auth.account.display_name_updated",
      targetType: "user",
      targetId: context.userId,
    });
    return this.getSnapshot(context);
  }

  async revokePasskey(
    context: AuthAccountContext,
    credentialId: string,
  ): Promise<AuthAccountSnapshot> {
    await this.requireActiveUser(context.userId);
    await this.credentials.revokeOwnedPasskeyIfAnotherRemains(
      credentialId,
      context.userId,
    );
    await this.identities.detachIdentityBySubject({
      userId: context.userId,
      type: "passkey",
      subject: credentialId,
    });
    await this.audit.append({
      actorUserId: context.userId,
      action: "auth.account.passkey_revoked",
      targetType: "passkey",
      targetId: credentialId,
    });
    return this.getSnapshot(context);
  }

  async revokeSession(
    context: AuthAccountContext,
    sessionId: string,
  ): Promise<AuthAccountSnapshot> {
    await this.requireActiveUser(context.userId);
    const sessions = await this.sessions.listActiveSessionsForSubject(
      context.userId,
    );
    const session = sessions.find(
      (candidate) => accountSessionId(candidate.id) === sessionId,
    );
    if (!session) throw new Error("Session not found");
    if (session.id === context.sessionId) {
      throw new Error("Use revoke all sessions to sign out this session");
    }
    if (
      !(await this.sessions.revokeActiveSessionForSubject(
        context.userId,
        session.id,
      ))
    ) {
      throw new Error("Session not found");
    }
    await this.audit.append({
      actorUserId: context.userId,
      action: "auth.account.session_revoked",
      targetType: "user",
      targetId: context.userId,
    });
    return this.getSnapshot(context);
  }

  async revokeOtherSessions(
    context: AuthAccountContext,
  ): Promise<{ account: AuthAccountSnapshot; sessions: number }> {
    await this.requireActiveUser(context.userId);
    const sessions = await this.sessions.revokeOtherActiveSessionsForSubject(
      context.userId,
      context.sessionId,
    );
    await this.audit.append({
      actorUserId: context.userId,
      action: "auth.account.other_sessions_revoked",
      targetType: "user",
      targetId: context.userId,
    });
    return { account: await this.getSnapshot(context), sessions };
  }

  async revokeAllSessions(
    context: AuthAccountContext,
  ): Promise<{ sessions: number; refreshTokens: number }> {
    await this.requireActiveUser(context.userId);
    const [sessions, refreshTokens] = await Promise.all([
      this.sessions.revokeActiveSessionsForSubject(context.userId),
      this.refreshTokens.revokeTokensForSubject(context.userId),
    ]);
    await this.audit.append({
      actorUserId: context.userId,
      action: "auth.account.all_sessions_revoked",
      targetType: "user",
      targetId: context.userId,
    });
    return { sessions, refreshTokens };
  }

  async generatePasskeyRegistrationOptions(
    context: AuthAccountContext,
    requestContext: WebAuthnRequestContext,
  ): Promise<PublicKeyCredentialCreationOptionsJSON> {
    const user = await this.requireActiveUser(context.userId);
    return this.passkeys.generateRegistrationOptions(requestContext, {
      subject: user.id,
      userName: user.displayName,
      userDisplayName: user.displayName,
    });
  }

  async verifyPasskeyRegistration(
    context: AuthAccountContext,
    response: RegistrationResponseJSON,
    requestContext: WebAuthnRequestContext,
  ): Promise<boolean> {
    await this.requireActiveUser(context.userId);
    let result;
    try {
      result = await this.passkeys.verifyRegistrationResponse(
        response,
        requestContext,
        context.userId,
      );
    } catch {
      await this.recordPasskeyRegistrationFailure(context.userId);
      return false;
    }
    if (!result.verified || result.subject !== context.userId) {
      await this.recordPasskeyRegistrationFailure(context.userId);
      return false;
    }
    await this.audit.append({
      actorUserId: context.userId,
      action: "auth.account.passkey_registered",
      targetType: "user",
      targetId: context.userId,
    });
    return true;
  }

  private async recordPasskeyRegistrationFailure(
    userId: string,
  ): Promise<void> {
    await this.audit.append({
      actorUserId: userId,
      action: "auth.account.passkey_registration_failed",
      targetType: "user",
      targetId: userId,
    });
  }

  private async requireActiveUser(userId: string): Promise<AuthUser> {
    const user = await this.users.getUser(userId);
    if (user?.status !== "active") {
      throw new Error("Active auth account not found");
    }
    return user;
  }
}

export function accountSessionId(internalSessionId: string): string {
  return sha256Base64Url(internalSessionId);
}

function passkeySummary(passkey: StoredPasskey): AuthAccountPasskey {
  return {
    id: passkey.id,
    ...(passkey.transports ? { transports: passkey.transports } : {}),
    ...(passkey.credentialDeviceType
      ? { credentialDeviceType: passkey.credentialDeviceType }
      : {}),
    credentialBackedUp: passkey.credentialBackedUp,
    createdAt: passkey.createdAt,
    updatedAt: passkey.updatedAt,
  };
}

function connectedChannelSummary(
  identity: AuthIdentityRecord,
): AuthAccountConnectedChannel[] {
  if (
    identity.type === "passkey" ||
    identity.revokedAt !== null ||
    identity.verifiedAt === null
  ) {
    return [];
  }
  return [
    {
      type: identity.type,
      label: redactedChannelLabel(identity),
      verifiedAt: identity.verifiedAt,
    },
  ];
}

function redactedChannelLabel(identity: AuthIdentityRecord): string {
  const value = identity.deliverySubject ?? identity.label;
  if (identity.type === "email" && value) return redactEmail(value);
  if (value) return redactLabel(value);
  return `${titleCase(identity.type)} account`;
}

function redactEmail(value: string): string {
  const normalized = value.trim().toLowerCase();
  const separator = normalized.lastIndexOf("@");
  if (separator <= 0 || separator === normalized.length - 1) {
    return "Email account";
  }
  const local = normalized.slice(0, separator);
  const domain = normalized.slice(separator + 1);
  return `${local.slice(0, 1)}${"•".repeat(Math.min(4, Math.max(2, local.length - 1)))}@${domain}`;
}

function redactLabel(value: string): string {
  const normalized = value.trim();
  if (!normalized) return "Connected account";
  return `${normalized.slice(0, 1)}${"•".repeat(Math.min(6, Math.max(2, normalized.length - 1)))}`;
}

function titleCase(value: string): string {
  return value.length > 0 ? `${value[0]?.toUpperCase()}${value.slice(1)}` : "";
}

function sessionSummary(
  session: AuthSessionRecord,
  currentSessionId: string,
): AuthAccountSessionSummary {
  return {
    id: accountSessionId(session.id),
    current: session.id === currentSessionId,
    createdAt: session.created_at,
    expiresAt: session.expires_at,
  };
}
