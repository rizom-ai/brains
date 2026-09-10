import { sql, type SQL } from "drizzle-orm";
import { guestRetentionSchema } from "@brains/contracts/chat";
import { conversations } from "./schema";

/** SQLite evaluates this when the statement runs, not before waiting for a writer. */
export const conversationSqlNow: SQL<string> = sql<string>`strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`;

/** Malformed leases and clock rollback deny access, but are NOT proof of expiry. */
export function liveGuestConversation(): SQL<number> {
  return guestRetentionCondition(false);
}

export function expiredGuestConversation(): SQL<number> {
  return guestRetentionCondition(true);
}

function guestRetentionCondition(expired: boolean): SQL<number> {
  const maxSeconds = guestRetentionSchema.shape.maxAgeSeconds.maxValue;
  // Round Julian-day arithmetic to the millisecond precision of stored ISO dates.
  const pastExpiry = sql`(
    CAST(round((julianday(${conversationSqlNow}) - julianday(${conversations.started})) * 86400000) AS INTEGER) >= json_extract(${conversations.metadata}, '$.guest.retention.maxAgeSeconds') * 1000
    OR CAST(round((julianday(${conversationSqlNow}) - julianday(${conversations.lastActive})) * 86400000) AS INTEGER) >= json_extract(${conversations.metadata}, '$.guest.retention.idleSeconds') * 1000
  )`;
  // CASE protects JSON functions from malformed storage. Creation validates the
  // full ownership schema; generic metadata updates cannot change the lease.
  return sql<number>`CASE WHEN json_valid(${conversations.metadata}) THEN coalesce(
    ${conversations.personId} IS NULL
    AND json_type(${conversations.metadata}, '$.guest.retention.idleSeconds') = 'integer'
    AND json_type(${conversations.metadata}, '$.guest.retention.maxAgeSeconds') = 'integer'
    AND json_extract(${conversations.metadata}, '$.guest.retention.idleSeconds') > 0
    AND json_extract(${conversations.metadata}, '$.guest.retention.idleSeconds') <= json_extract(${conversations.metadata}, '$.guest.retention.maxAgeSeconds')
    AND json_extract(${conversations.metadata}, '$.guest.retention.maxAgeSeconds') <= ${maxSeconds}
    AND strftime('%Y-%m-%dT%H:%M:%fZ', ${conversations.started}) = ${conversations.started}
    AND strftime('%Y-%m-%dT%H:%M:%fZ', ${conversations.lastActive}) = ${conversations.lastActive}
    AND ${conversations.started} <= ${conversations.lastActive}
    AND ${conversations.lastActive} <= ${conversationSqlNow}
    AND ${expired ? pastExpiry : sql`NOT ${pastExpiry}`}
    , 0) ELSE 0 END`;
}
