import type { AuthAuditStore } from "./audit-store";
import { auditActor, type AuthMutationContext } from "./mutation-context";
import type { RefreshTokenPersistence } from "./refresh-token-store";
import type { AuthUser } from "./runtime-schema";
import type { AuthSessionPersistence } from "./session-store";
import type {
  AuthUserRole,
  AuthUserStatus,
  AuthUserStore,
  CreateAuthUserInput,
} from "./user-store";

export interface AuthUserManagementServiceOptions {
  users: AuthUserStore;
  audit: AuthAuditStore;
  sessions: Pick<AuthSessionPersistence, "revokeSessionsForSubject">;
  refreshTokens: Pick<RefreshTokenPersistence, "revokeTokensForSubject">;
  consumeTargetedSetupTokensForUser(userId: string): Promise<number>;
  onUserDeleted?(userId: string): void;
}

export class AuthUserManagementService {
  private readonly users: AuthUserStore;
  private readonly audit: AuthAuditStore;
  private readonly sessions: Pick<
    AuthSessionPersistence,
    "revokeSessionsForSubject"
  >;
  private readonly refreshTokens: Pick<
    RefreshTokenPersistence,
    "revokeTokensForSubject"
  >;
  private readonly consumeTargetedSetupTokensForUser: (
    userId: string,
  ) => Promise<number>;
  private readonly onUserDeleted: ((userId: string) => void) | undefined;

  constructor(options: AuthUserManagementServiceOptions) {
    this.users = options.users;
    this.audit = options.audit;
    this.sessions = options.sessions;
    this.refreshTokens = options.refreshTokens;
    this.consumeTargetedSetupTokensForUser =
      options.consumeTargetedSetupTokensForUser;
    this.onUserDeleted = options.onUserDeleted;
  }

  async createUser(
    input: CreateAuthUserInput,
    context: AuthMutationContext = {},
  ): Promise<AuthUser> {
    const user = await this.users.createUser(input);
    await this.audit.append({
      ...auditActor(context),
      action: "auth.user.created",
      targetType: "user",
      targetId: user.id,
      metadata: { role: user.role, status: user.status },
    });
    return user;
  }

  async updateRole(
    userId: string,
    role: AuthUserRole,
    context: AuthMutationContext = {},
  ): Promise<AuthUser> {
    const current = await this.users.getUser(userId);
    const updated = await this.users.updateUserRole(userId, role);
    if (current && current.role !== updated.role) {
      await this.revokeGrants(userId);
      await this.audit.append({
        ...auditActor(context),
        action: "auth.user.role_updated",
        targetType: "user",
        targetId: userId,
        metadata: { from: current.role, to: updated.role },
      });
    }
    return updated;
  }

  async updateStatus(
    userId: string,
    status: AuthUserStatus,
    context: AuthMutationContext = {},
  ): Promise<AuthUser> {
    const current = await this.users.getUser(userId);
    const updated = await this.users.updateUserStatus(userId, status);
    if (current && current.status !== updated.status) {
      const consumedSetupTokens =
        updated.status === "suspended"
          ? await this.consumeTargetedSetupTokensForUser(userId)
          : 0;
      await this.revokeGrants(userId);
      await this.audit.append({
        ...auditActor(context),
        action: "auth.user.status_updated",
        targetType: "user",
        targetId: userId,
        metadata: {
          from: current.status,
          to: updated.status,
          ...(consumedSetupTokens > 0 ? { consumedSetupTokens } : {}),
        },
      });
    }
    return updated;
  }

  async deleteSuspendedUser(
    userId: string,
    context: AuthMutationContext = {},
  ): Promise<AuthUser> {
    const deleted = await this.users.deleteSuspendedUser(userId);
    this.onUserDeleted?.(userId);
    await this.audit.append({
      ...auditActor(context),
      action: "auth.user.deleted",
      targetType: "user",
      targetId: userId,
      metadata: { role: deleted.role, status: deleted.status },
    });
    return deleted;
  }

  async revokeGrants(
    userId: string,
    context: AuthMutationContext = {},
  ): Promise<{ sessions: number; refreshTokens: number }> {
    const [sessions, refreshTokens] = await Promise.all([
      this.sessions.revokeSessionsForSubject(userId),
      this.refreshTokens.revokeTokensForSubject(userId),
    ]);
    if (context.actorUserId) {
      await this.audit.append({
        ...auditActor(context),
        action: "auth.user.grants_revoked",
        targetType: "user",
        targetId: userId,
        metadata: { sessions, refreshTokens },
      });
    }
    return { sessions, refreshTokens };
  }
}
