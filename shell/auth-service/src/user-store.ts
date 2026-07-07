import { createHash } from "node:crypto";
import { and, eq, isNotNull, isNull } from "drizzle-orm";
import { createPrefixedId } from "@brains/utils/id";
import type { AuthRuntimeDB } from "./runtime-db";
import {
  authIdentities,
  authUsers,
  type AuthIdentity,
  type AuthUser,
} from "./runtime-schema";

export type AuthUserRole = AuthUser["role"];
export type AuthUserStatus = AuthUser["status"];
export type AuthIdentityType = AuthIdentity["type"];

export interface CreateAuthUserInput {
  displayName: string;
  role?: AuthUserRole;
  status?: AuthUserStatus;
  canonicalId?: string;
}

export interface AttachAuthIdentityInput {
  userId: string;
  type: AuthIdentityType;
  subject: string;
  issuer?: string;
  deliverySubject?: string;
  label?: string;
  verifiedAt?: number;
}

export interface ResolveAuthIdentityInput {
  type: AuthIdentityType;
  subject: string;
  issuer?: string;
}

export class AuthUserStore {
  constructor(private readonly db: AuthRuntimeDB) {}

  async ensureFirstAnchorUser(
    input: { displayName?: string } = {},
  ): Promise<AuthUser> {
    const existingAnchor = await this.findFirstActiveAnchor();
    if (existingAnchor) {
      return existingAnchor;
    }

    const users = await this.listUsers();
    if (users.length > 0) {
      throw new Error(
        "Auth users already exist but no active anchor user was found",
      );
    }

    return this.createUser({
      displayName: input.displayName ?? "Operator",
      role: "anchor",
      status: "active",
    });
  }

  async createUser(input: CreateAuthUserInput): Promise<AuthUser> {
    const now = Date.now();
    const id = createPrefixedId("usr");
    const user = {
      id,
      displayName: input.displayName,
      role: input.role ?? "public",
      status: input.status ?? "active",
      canonicalId: input.canonicalId ?? canonicalIdForUserId(id),
      createdAt: now,
      updatedAt: now,
    } satisfies typeof authUsers.$inferInsert;

    await this.db.insert(authUsers).values(user);
    return user;
  }

  async listUsers(): Promise<AuthUser[]> {
    return this.db.select().from(authUsers).orderBy(authUsers.createdAt);
  }

  async getUser(userId: string): Promise<AuthUser | undefined> {
    const [user] = await this.db
      .select()
      .from(authUsers)
      .where(eq(authUsers.id, userId))
      .limit(1);
    return user;
  }

  async updateUserRole(userId: string, role: AuthUserRole): Promise<AuthUser> {
    const user = await this.requireUser(userId);
    await this.assertKeepsActiveAnchor(user, { role });

    const now = Date.now();
    await this.db
      .update(authUsers)
      .set({ role, updatedAt: now })
      .where(eq(authUsers.id, userId));

    return this.requireUser(userId);
  }

  async updateUserStatus(
    userId: string,
    status: AuthUserStatus,
  ): Promise<AuthUser> {
    const user = await this.requireUser(userId);
    await this.assertKeepsActiveAnchor(user, { status });

    const now = Date.now();
    await this.db
      .update(authUsers)
      .set({ status, updatedAt: now })
      .where(eq(authUsers.id, userId));

    return this.requireUser(userId);
  }

  async attachIdentity(input: AttachAuthIdentityInput): Promise<AuthIdentity> {
    await this.requireUser(input.userId);

    const identity = {
      id: createPrefixedId("aid"),
      userId: input.userId,
      type: input.type,
      issuer: input.issuer ?? null,
      identityKeyHash: hashIdentityKey(normalizeIdentityKey(input)),
      deliverySubject: input.deliverySubject ?? null,
      label: input.label ?? null,
      verifiedAt: input.verifiedAt ?? null,
      revokedAt: null,
      createdAt: Date.now(),
    } satisfies typeof authIdentities.$inferInsert;

    await this.db.insert(authIdentities).values(identity);
    return identity;
  }

  async detachIdentity(identityId: string): Promise<void> {
    await this.db
      .update(authIdentities)
      .set({ revokedAt: Date.now() })
      .where(eq(authIdentities.id, identityId));
  }

  async resolveIdentity(
    input: ResolveAuthIdentityInput,
  ): Promise<AuthUser | undefined> {
    const identityKeyHash = hashIdentityKey(normalizeIdentityKey(input));
    const [row] = await this.db
      .select({ user: authUsers })
      .from(authIdentities)
      .innerJoin(authUsers, eq(authIdentities.userId, authUsers.id))
      .where(
        and(
          eq(authIdentities.identityKeyHash, identityKeyHash),
          isNull(authIdentities.revokedAt),
          isNotNull(authIdentities.verifiedAt),
          eq(authUsers.status, "active"),
        ),
      )
      .limit(1);

    return row?.user;
  }

  private async requireUser(userId: string): Promise<AuthUser> {
    const user = await this.getUser(userId);
    if (!user) {
      throw new Error(`Auth user not found: ${userId}`);
    }
    return user;
  }

  private async findFirstActiveAnchor(): Promise<AuthUser | undefined> {
    const [user] = await this.db
      .select()
      .from(authUsers)
      .where(and(eq(authUsers.role, "anchor"), eq(authUsers.status, "active")))
      .orderBy(authUsers.createdAt)
      .limit(1);
    return user;
  }

  private async assertKeepsActiveAnchor(
    user: AuthUser,
    update: { role?: AuthUserRole; status?: AuthUserStatus },
  ): Promise<void> {
    if (user.role !== "anchor" || user.status !== "active") {
      return;
    }

    const nextRole = update.role ?? user.role;
    const nextStatus = update.status ?? user.status;
    if (nextRole === "anchor" && nextStatus === "active") {
      return;
    }

    const activeAnchors = await this.db
      .select({ id: authUsers.id })
      .from(authUsers)
      .where(and(eq(authUsers.role, "anchor"), eq(authUsers.status, "active")));
    if (activeAnchors.length <= 1) {
      throw new Error("Cannot remove the last active anchor user");
    }
  }
}

export function normalizeIdentityKey(input: ResolveAuthIdentityInput): string {
  const subject = input.subject.trim();
  if (!subject) {
    throw new Error("Identity subject is required");
  }

  switch (input.type) {
    case "email":
      return `email:${subject.toLowerCase()}`;
    case "oauth": {
      const issuer = input.issuer?.trim();
      if (!issuer) {
        throw new Error("OAuth identity issuer is required");
      }
      return `oauth:${issuer}:${subject}`;
    }
    default:
      return `${input.type}:${subject}`;
  }
}

export function hashIdentityKey(identityKey: string): string {
  return createHash("sha256").update(identityKey).digest("hex");
}

function canonicalIdForUserId(userId: string): string {
  return `user:${userId.slice("usr_".length)}`;
}
