import { sha256Hex } from "@brains/utils/hash";

/**
 * The stored form of a caller's idempotency key.
 *
 * Only the hash reaches the database. A caller's key may identify a person or
 * a request, and the service needs to recognise a retry, not to keep what the
 * caller called it.
 *
 * Padding is ignored so that the same request retried through a different
 * client still replays rather than creating a second invitation.
 */
export function invitationIdempotencyKeyHash(value: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error("Invitation idempotency key is required");
  return sha256Hex(normalized);
}
