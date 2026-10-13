import { and, eq, inArray, lte, or } from "drizzle-orm";
import {
  authInvitationDeliveryAttempts,
  authInvitations,
} from "./invitation-schema";
import type { AuthRuntimeDB } from "./runtime-db";

/**
 * When a delivery counts as interrupted.
 *
 * This rule is asked twice on every recovery pass, in two languages: once as
 * SQL, to find candidates, and once in TypeScript, inside the transaction that
 * takes one over — because a candidate can progress between being selected and
 * being claimed. The two must agree. Keeping both here is what makes that
 * checkable; splitting them is how recovery starts missing deliveries it
 * selected, or re-sending ones it should not have.
 */

/** Attempts last touched at or before this moment are interrupted. */
export function staleDeliveryCutoff(now: number, staleMs: number): number {
  return now - staleMs;
}

export interface DeliveryAttemptTiming {
  state: string;
  queuedAt: number;
  startedAt: number | null;
}

/**
 * The TypeScript half of the rule, matching the SQL in
 * {@link selectInterruptedDeliveries} clause for clause.
 *
 * A `sending` attempt with no start time is never interrupted: a SQL
 * comparison against NULL does not match, and treating it as stale here would
 * re-send a delivery that may still be running.
 */
export function isInterruptedDelivery(
  attempt: DeliveryAttemptTiming,
  cutoff: number,
): boolean {
  if (attempt.state === "queued") return attempt.queuedAt <= cutoff;
  if (attempt.state === "sending")
    return attempt.startedAt !== null && attempt.startedAt <= cutoff;
  return false;
}

export interface InterruptedDeliveryCandidate {
  attemptId: string;
  attemptState: "queued" | "sending";
  invitationId: string;
  providerId: string;
  queuedAt: number;
  startedAt: number | null;
}

/**
 * The SQL half of the rule: attempts of an invitation still pending or sending
 * whose own state has not moved since the cutoff.
 */
export function selectInterruptedDeliveries(
  db: AuthRuntimeDB,
  cutoff: number,
): Promise<
  {
    attemptId: string;
    attemptState: string;
    invitationId: string;
    providerId: string;
    queuedAt: number;
    startedAt: number | null;
  }[]
> {
  return db
    .select({
      attemptId: authInvitationDeliveryAttempts.id,
      attemptState: authInvitationDeliveryAttempts.state,
      invitationId: authInvitationDeliveryAttempts.invitationId,
      providerId: authInvitationDeliveryAttempts.providerId,
      queuedAt: authInvitationDeliveryAttempts.queuedAt,
      startedAt: authInvitationDeliveryAttempts.startedAt,
    })
    .from(authInvitationDeliveryAttempts)
    .innerJoin(
      authInvitations,
      eq(authInvitations.id, authInvitationDeliveryAttempts.invitationId),
    )
    .where(
      and(
        inArray(authInvitations.state, ["pending", "sending"]),
        or(
          and(
            eq(authInvitationDeliveryAttempts.state, "queued"),
            lte(authInvitationDeliveryAttempts.queuedAt, cutoff),
          ),
          and(
            eq(authInvitationDeliveryAttempts.state, "sending"),
            lte(authInvitationDeliveryAttempts.startedAt, cutoff),
          ),
        ),
      ),
    );
}
