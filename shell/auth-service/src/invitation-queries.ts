import { eq, sql } from "drizzle-orm";
import {
  authInvitationDeliveryAttempts,
  authInvitations,
  type AuthInvitation,
  type AuthInvitationDeliveryAttempt,
} from "./invitation-schema";
import type { AuthRuntimeDB } from "./runtime-db";
import { setupTokens } from "./runtime-schema";

/**
 * Reading invitations.
 *
 * Every listing orders by creation time with `rowid` as a tiebreak. Two
 * invitations created in the same millisecond are otherwise ordered
 * arbitrarily, and an operator comparing two page loads would see them swap.
 *
 * None of these expires anything. Expiry is lazy — the service reconciles
 * expired invitations before listing them, so that a list is never showing a
 * pending invitation whose setup link has already died. That ordering is the
 * service's to keep, which is why it is not folded in here.
 */

export function listInvitations(db: AuthRuntimeDB): Promise<AuthInvitation[]> {
  return db
    .select()
    .from(authInvitations)
    .orderBy(authInvitations.createdAt, sql`rowid`);
}

/**
 * Every invitation, with the expiry of the setup link each one currently
 * points at, in milliseconds.
 *
 * An invitation whose current token has been replaced — by a resend — has no
 * row here rather than a stale one.
 */
export async function listInvitationsWithSetupExpirations(
  db: AuthRuntimeDB,
): Promise<{
  invitations: AuthInvitation[];
  expirations: Map<string, number>;
}> {
  const [invitations, expirationRows] = await Promise.all([
    listInvitations(db),
    db
      .select({
        invitationId: authInvitations.id,
        expiresAt: setupTokens.expiresAt,
      })
      .from(authInvitations)
      .innerJoin(
        setupTokens,
        eq(setupTokens.tokenHash, authInvitations.currentSetupTokenHash),
      ),
  ]);
  return {
    invitations,
    expirations: new Map(
      expirationRows.map((row) => [row.invitationId, row.expiresAt * 1_000]),
    ),
  };
}

export function listDeliveryAttempts(
  db: AuthRuntimeDB,
  invitationId: string,
): Promise<AuthInvitationDeliveryAttempt[]> {
  return db
    .select()
    .from(authInvitationDeliveryAttempts)
    .where(eq(authInvitationDeliveryAttempts.invitationId, invitationId))
    .orderBy(authInvitationDeliveryAttempts.queuedAt, sql`rowid`);
}
