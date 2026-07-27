import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
import {
  authIdentities,
  authUsers,
  setupTokens,
  type AuthIntegerColumn,
  type AuthTable,
  type AuthTextColumn,
} from "./runtime-schema";

export type AuthInvitationState =
  | "pending"
  | "sending"
  | "sent"
  | "claimed"
  | "expired"
  | "cancelled"
  | "failed";

export type AuthInvitationDeliveryAttemptState =
  "queued" | "sending" | "sent" | "failed";

type AuthInvitationsTable = AuthTable<
  "auth_invitations",
  {
    id: AuthTextColumn<"auth_invitations", "id", true, true>;
    userId: AuthTextColumn<"auth_invitations", "user_id", true>;
    deliveryClaimId: AuthTextColumn<
      "auth_invitations",
      "delivery_claim_id",
      true
    >;
    currentSetupTokenHash: AuthTextColumn<
      "auth_invitations",
      "current_setup_token_hash",
      true
    >;
    createdByUserId: AuthTextColumn<
      "auth_invitations",
      "created_by_user_id",
      false
    >;
    idempotencyKeyHash: AuthTextColumn<
      "auth_invitations",
      "idempotency_key_hash",
      true
    >;
    state: AuthTextColumn<
      "auth_invitations",
      "state",
      true,
      false,
      AuthInvitationState,
      [
        "pending",
        "sending",
        "sent",
        "claimed",
        "expired",
        "cancelled",
        "failed",
      ]
    >;
    failureCode: AuthTextColumn<"auth_invitations", "failure_code", false>;
    createdAt: AuthIntegerColumn<"auth_invitations", "created_at", true>;
    updatedAt: AuthIntegerColumn<"auth_invitations", "updated_at", true>;
    sentAt: AuthIntegerColumn<"auth_invitations", "sent_at", false>;
    claimedAt: AuthIntegerColumn<"auth_invitations", "claimed_at", false>;
    expiredAt: AuthIntegerColumn<"auth_invitations", "expired_at", false>;
    cancelledAt: AuthIntegerColumn<"auth_invitations", "cancelled_at", false>;
  }
>;

export const authInvitations: AuthInvitationsTable = sqliteTable(
  "auth_invitations",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => authUsers.id, { onDelete: "cascade" }),
    deliveryClaimId: text("delivery_claim_id")
      .notNull()
      .references(() => authIdentities.id, { onDelete: "cascade" }),
    currentSetupTokenHash: text("current_setup_token_hash")
      .notNull()
      .references(() => setupTokens.tokenHash),
    createdByUserId: text("created_by_user_id").references(() => authUsers.id, {
      onDelete: "set null",
    }),
    idempotencyKeyHash: text("idempotency_key_hash").notNull(),
    state: text("state", {
      enum: [
        "pending",
        "sending",
        "sent",
        "claimed",
        "expired",
        "cancelled",
        "failed",
      ],
    }).notNull(),
    failureCode: text("failure_code"),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
    sentAt: integer("sent_at"),
    claimedAt: integer("claimed_at"),
    expiredAt: integer("expired_at"),
    cancelledAt: integer("cancelled_at"),
  },
  (table) => ({
    idempotencyKeyIdx: uniqueIndex("idx_auth_invitations_idempotency_key").on(
      table.idempotencyKeyHash,
    ),
    currentSetupTokenIdx: uniqueIndex(
      "idx_auth_invitations_current_setup_token",
    ).on(table.currentSetupTokenHash),
    userIdIdx: index("idx_auth_invitations_user_id").on(table.userId),
    stateIdx: index("idx_auth_invitations_state").on(table.state),
    stateCheck: check(
      "auth_invitations_state_check",
      sql`${table.state} IN ('pending', 'sending', 'sent', 'claimed', 'expired', 'cancelled', 'failed')`,
    ),
  }),
);

type AuthInvitationDeliveryAttemptsTable = AuthTable<
  "auth_invitation_delivery_attempts",
  {
    id: AuthTextColumn<"auth_invitation_delivery_attempts", "id", true, true>;
    invitationId: AuthTextColumn<
      "auth_invitation_delivery_attempts",
      "invitation_id",
      true
    >;
    setupTokenHash: AuthTextColumn<
      "auth_invitation_delivery_attempts",
      "setup_token_hash",
      true
    >;
    providerId: AuthTextColumn<
      "auth_invitation_delivery_attempts",
      "provider_id",
      true
    >;
    providerDeliveryId: AuthTextColumn<
      "auth_invitation_delivery_attempts",
      "provider_delivery_id",
      false
    >;
    state: AuthTextColumn<
      "auth_invitation_delivery_attempts",
      "state",
      true,
      false,
      AuthInvitationDeliveryAttemptState,
      ["queued", "sending", "sent", "failed"]
    >;
    failureCode: AuthTextColumn<
      "auth_invitation_delivery_attempts",
      "failure_code",
      false
    >;
    queuedAt: AuthIntegerColumn<
      "auth_invitation_delivery_attempts",
      "queued_at",
      true
    >;
    startedAt: AuthIntegerColumn<
      "auth_invitation_delivery_attempts",
      "started_at",
      false
    >;
    completedAt: AuthIntegerColumn<
      "auth_invitation_delivery_attempts",
      "completed_at",
      false
    >;
  }
>;

export const authInvitationDeliveryAttempts: AuthInvitationDeliveryAttemptsTable =
  sqliteTable(
    "auth_invitation_delivery_attempts",
    {
      id: text("id").primaryKey(),
      invitationId: text("invitation_id")
        .notNull()
        .references(() => authInvitations.id, { onDelete: "cascade" }),
      setupTokenHash: text("setup_token_hash")
        .notNull()
        .references(() => setupTokens.tokenHash),
      providerId: text("provider_id").notNull(),
      providerDeliveryId: text("provider_delivery_id"),
      state: text("state", {
        enum: ["queued", "sending", "sent", "failed"],
      }).notNull(),
      failureCode: text("failure_code"),
      queuedAt: integer("queued_at").notNull(),
      startedAt: integer("started_at"),
      completedAt: integer("completed_at"),
    },
    (table) => ({
      invitationIdIdx: index(
        "idx_auth_invitation_delivery_attempts_invitation_id",
      ).on(table.invitationId),
      stateIdx: index("idx_auth_invitation_delivery_attempts_state").on(
        table.state,
      ),
      stateCheck: check(
        "auth_invitation_delivery_attempts_state_check",
        sql`${table.state} IN ('queued', 'sending', 'sent', 'failed')`,
      ),
    }),
  );

export type AuthInvitation = typeof authInvitations.$inferSelect;
export type AuthInvitationDeliveryAttempt =
  typeof authInvitationDeliveryAttempts.$inferSelect;
