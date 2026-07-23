import { and, eq, exists, isNotNull, ne, notExists, or } from "drizzle-orm";
import { alias } from "drizzle-orm/sqlite-core";
import { createPrefixedId } from "@brains/utils/id";
import type { AuthRuntimeDB } from "./runtime-db";
import {
  authBrainAnchor,
  authPeople,
  authUsers,
  type AuthBrainAnchor,
  type AuthPerson,
  type AuthUser,
} from "./runtime-schema";

export type AuthUserRole = AuthUser["role"];
export type AuthUserStatus = AuthUser["status"];

export interface CreateAuthPersonInput {
  displayName: string;
}

export interface ConfigureBrainAnchorInput {
  kind: AuthBrainAnchor["kind"];
  displayName: string;
  profileEntityId: string;
}

export interface CreateAuthUserInput {
  displayName: string;
  personId?: string;
  role?: AuthUserRole;
  status?: AuthUserStatus;
  canonicalId?: string;
}

export class AuthUserStore {
  private readonly db: AuthRuntimeDB;
  private firstAdminInitialization: Promise<AuthUser> | undefined;

  constructor(db: AuthRuntimeDB) {
    this.db = db;
  }

  async ensureFirstAdminUser(
    input: { displayName?: string } = {},
  ): Promise<AuthUser> {
    if (this.firstAdminInitialization) return this.firstAdminInitialization;

    const initialization = this.ensureFirstAdminUserTransaction(input);
    this.firstAdminInitialization = initialization;
    try {
      return await initialization;
    } finally {
      if (this.firstAdminInitialization === initialization) {
        this.firstAdminInitialization = undefined;
      }
    }
  }

  private ensureFirstAdminUserTransaction(input: {
    displayName?: string;
  }): Promise<AuthUser> {
    return this.db.transaction(async (tx) => {
      const [existingAdmin] = await tx
        .select()
        .from(authUsers)
        .where(and(eq(authUsers.role, "admin"), eq(authUsers.status, "active")))
        .orderBy(authUsers.createdAt)
        .limit(1);
      if (existingAdmin) {
        const [existingAnchor] = await tx
          .select()
          .from(authBrainAnchor)
          .limit(1);
        if (!existingAnchor) {
          const [person] = await tx
            .select()
            .from(authPeople)
            .where(eq(authPeople.id, existingAdmin.personId))
            .limit(1);
          if (!person) {
            throw new Error(`Auth person not found: ${existingAdmin.personId}`);
          }
          await tx.insert(authBrainAnchor).values({
            id: "brain",
            kind: "person",
            subjectId: person.id,
            displayName: person.displayName,
            profileEntityId: person.profileEntityId,
            createdAt: existingAdmin.createdAt,
            updatedAt: existingAdmin.updatedAt,
          });
        }
        return existingAdmin;
      }

      const [existingUser] = await tx.select().from(authUsers).limit(1);
      if (existingUser) {
        throw new Error(
          "Auth users already exist but no active admin user was found",
        );
      }

      const [configuredAnchor] = await tx
        .select({ id: authBrainAnchor.id })
        .from(authBrainAnchor)
        .where(eq(authBrainAnchor.id, "brain"))
        .limit(1);
      const now = Date.now();
      const id = createPrefixedId("usr");
      const personId = createPrefixedId("prsn");
      const displayName = input.displayName ?? "Admin";
      await tx.insert(authPeople).values({
        id: personId,
        displayName,
        profileEntityId: null,
        createdAt: now,
        updatedAt: now,
      });
      const user = {
        id,
        personId,
        displayName,
        role: "admin",
        status: "active",
        canonicalId: canonicalIdForUserId(id),
        createdAt: now,
        updatedAt: now,
      } satisfies typeof authUsers.$inferInsert;
      await tx.insert(authUsers).values(user);
      if (!configuredAnchor) {
        await tx.insert(authBrainAnchor).values({
          id: "brain",
          kind: "person",
          subjectId: personId,
          displayName,
          profileEntityId: null,
          createdAt: now,
          updatedAt: now,
        });
      }
      return user;
    });
  }

  async getBrainAnchor(): Promise<AuthBrainAnchor | undefined> {
    const [anchor] = await this.db.select().from(authBrainAnchor).limit(1);
    return anchor;
  }

  /** Project the config-declared ownership kind into the runtime singleton. */
  async configureBrainAnchor(
    input: ConfigureBrainAnchorInput,
  ): Promise<AuthBrainAnchor | undefined> {
    const displayName = input.displayName.trim();
    if (!displayName) throw new Error("Brain anchor display name is required");

    return this.db.transaction(async (tx) => {
      const [current] = await tx
        .select()
        .from(authBrainAnchor)
        .where(eq(authBrainAnchor.id, "brain"))
        .limit(1);
      const now = Date.now();
      let subjectId: string;

      // Hosted profiles belong only to the configured personal Anchor. Clear
      // stale member projections before applying the current Anchor config.
      await tx
        .update(authPeople)
        .set({ profileEntityId: null, updatedAt: now })
        .where(isNotNull(authPeople.profileEntityId));

      if (input.kind === "person") {
        const currentPersonId =
          current?.kind === "person" ? current.subjectId : undefined;
        const activeAdmins = await tx
          .select()
          .from(authUsers)
          .where(
            and(eq(authUsers.role, "admin"), eq(authUsers.status, "active")),
          )
          .orderBy(authUsers.createdAt);
        const anchorAdmin =
          activeAdmins.find((user) => user.personId === currentPersonId) ??
          activeAdmins[0];
        if (!anchorAdmin) return undefined;
        subjectId = anchorAdmin.personId;
        await tx
          .update(authPeople)
          .set({ profileEntityId: input.profileEntityId, updatedAt: now })
          .where(eq(authPeople.id, subjectId));
      } else {
        subjectId =
          current?.kind === "collective"
            ? current.subjectId
            : createPrefixedId("coll");
      }

      const [anchor] = await tx
        .insert(authBrainAnchor)
        .values({
          id: "brain",
          kind: input.kind,
          subjectId,
          displayName,
          profileEntityId: input.profileEntityId,
          createdAt: current?.createdAt ?? now,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: authBrainAnchor.id,
          set: {
            kind: input.kind,
            subjectId,
            displayName,
            profileEntityId: input.profileEntityId,
            updatedAt: now,
          },
        })
        .returning();
      return anchor;
    });
  }

  async createPerson(input: CreateAuthPersonInput): Promise<AuthPerson> {
    const now = Date.now();
    const person = {
      id: createPrefixedId("prsn"),
      displayName: input.displayName,
      profileEntityId: null,
      createdAt: now,
      updatedAt: now,
    } satisfies typeof authPeople.$inferInsert;
    await this.db.insert(authPeople).values(person);
    return person;
  }

  async getPerson(personId: string): Promise<AuthPerson | undefined> {
    const [person] = await this.db
      .select()
      .from(authPeople)
      .where(eq(authPeople.id, personId))
      .limit(1);
    return person;
  }

  async createUser(input: CreateAuthUserInput): Promise<AuthUser> {
    return this.db.transaction(async (tx) => {
      const now = Date.now();
      const id = createPrefixedId("usr");
      const personId = input.personId ?? createPrefixedId("prsn");

      if (input.personId) {
        const [person] = await tx
          .select({ id: authPeople.id })
          .from(authPeople)
          .where(eq(authPeople.id, input.personId))
          .limit(1);
        if (!person)
          throw new Error(`Auth person not found: ${input.personId}`);
      } else {
        await tx.insert(authPeople).values({
          id: personId,
          displayName: input.displayName,
          profileEntityId: null,
          createdAt: now,
          updatedAt: now,
        });
      }

      const user = {
        id,
        personId,
        displayName: input.displayName,
        role: input.role ?? "public",
        status: input.status ?? "active",
        canonicalId: input.canonicalId ?? canonicalIdForUserId(id),
        createdAt: now,
        updatedAt: now,
      } satisfies typeof authUsers.$inferInsert;
      await tx.insert(authUsers).values(user);
      return user;
    });
  }

  async listUsers(): Promise<AuthUser[]> {
    return this.db.select().from(authUsers).orderBy(authUsers.createdAt);
  }

  async listPeople(): Promise<AuthPerson[]> {
    return this.db.select().from(authPeople).orderBy(authPeople.createdAt);
  }

  async getUser(userId: string): Promise<AuthUser | undefined> {
    const [user] = await this.db
      .select()
      .from(authUsers)
      .where(eq(authUsers.id, userId))
      .limit(1);
    return user;
  }

  async getUserByPersonId(personId: string): Promise<AuthUser | undefined> {
    const [user] = await this.db
      .select()
      .from(authUsers)
      .where(eq(authUsers.personId, personId))
      .limit(1);
    return user;
  }

  updateUserRole(userId: string, role: AuthUserRole): Promise<AuthUser> {
    return this.applyGuardedUserMutation(userId, { kind: "role", value: role });
  }

  updateUserStatus(userId: string, status: AuthUserStatus): Promise<AuthUser> {
    return this.applyGuardedUserMutation(userId, {
      kind: "status",
      value: status,
    });
  }

  private async applyGuardedUserMutation(
    userId: string,
    mutation:
      | { kind: "role"; value: AuthUserRole }
      | { kind: "status"; value: AuthUserStatus },
  ): Promise<AuthUser> {
    const existing = await this.requireUser(userId);
    const currentValue =
      mutation.kind === "role" ? existing.role : existing.status;
    if (currentValue === mutation.value) return existing;

    const relaxing =
      mutation.kind === "role"
        ? mutation.value === "admin"
        : mutation.value === "active";
    const otherUsers = alias(authUsers, "other_active_admin_users");
    const isPersonalAnchor = this.db
      .select({ subjectId: authBrainAnchor.subjectId })
      .from(authBrainAnchor)
      .where(
        and(
          eq(authBrainAnchor.id, "brain"),
          eq(authBrainAnchor.kind, "person"),
          eq(authBrainAnchor.subjectId, authUsers.personId),
        ),
      );
    const hasOtherActiveAdmin = this.db
      .select({ id: otherUsers.id })
      .from(otherUsers)
      .where(
        and(
          ne(otherUsers.id, userId),
          eq(otherUsers.role, "admin"),
          eq(otherUsers.status, "active"),
        ),
      );
    const values =
      mutation.kind === "role"
        ? { role: mutation.value, updatedAt: Date.now() }
        : { status: mutation.value, updatedAt: Date.now() };

    await this.db
      .update(authUsers)
      .set(values)
      .where(
        and(
          eq(authUsers.id, userId),
          relaxing ? undefined : notExists(isPersonalAnchor),
          relaxing
            ? undefined
            : or(
                ne(authUsers.role, "admin"),
                ne(authUsers.status, "active"),
                exists(hasOtherActiveAdmin),
              ),
        ),
      );

    const updated = await this.requireUser(userId);
    const updatedValue =
      mutation.kind === "role" ? updated.role : updated.status;
    if (updatedValue !== mutation.value) {
      await this.throwAdminInvariantError(existing);
    }
    return updated;
  }

  private async throwAdminInvariantError(user: AuthUser): Promise<never> {
    const anchor = await this.getBrainAnchor();
    if (anchor?.kind === "person" && anchor.subjectId === user.personId) {
      throw new Error("Cannot remove the personal brain anchor's admin access");
    }
    throw new Error("Cannot remove the last active admin user");
  }

  private async requireUser(userId: string): Promise<AuthUser> {
    const user = await this.getUser(userId);
    if (!user) throw new Error(`Auth user not found: ${userId}`);
    return user;
  }
}

function canonicalIdForUserId(userId: string): string {
  return `user:${userId.slice("usr_".length)}`;
}
