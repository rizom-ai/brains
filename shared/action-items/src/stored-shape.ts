import { actorRefKey, actorRefSchema } from "@brains/contracts";
import { z } from "@brains/utils/zod";

/*
 * Reading action items stored in the legacy (pre-trim) shape. The next write
 * of such an item stores the trimmed shape; see docs/legacy-code-inventory.json.
 */

/**
 * Fields the projector wrote before the trim whose value goes nowhere. Stored
 * items may still carry them until their next write; they are read past,
 * never written.
 */
export const ACTION_ITEM_RETIRED_FIELDS: readonly string[] = [
  "spaceId",
  "sourceSummaryId",
  "sourceMessageCount",
  "projectionVersion",
];

/**
 * Pre-trim fields whose value the parser still reads: timeRange's end becomes
 * capturedAt. Never written back.
 */
export const ACTION_ITEM_TRANSLATED_FIELDS: readonly string[] = ["timeRange"];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * A person stored as a nested identity or a legacy actor id, read flat:
 * `{ name, id, aliases }`. `normalize` turns legacy actor ids into identities.
 */
export function flattenStoredPerson(
  value: unknown,
  normalize: (value: unknown) => unknown,
): unknown {
  if (!isRecord(value) || "name" in value) return value;
  if ("id" in value && !("identity" in value)) return value;
  const stored = normalize(value);
  if (!isRecord(stored)) return stored;
  const identity = actorRefSchema.safeParse(stored["identity"]);
  const id = identity.success ? actorRefKey(identity.data) : undefined;
  const aliases = z
    .array(actorRefSchema)
    .catch([])
    .parse(stored["identityAliases"] ?? [])
    .map(actorRefKey)
    .filter((alias) => alias !== id);
  const name = stored["displayName"];
  return {
    ...(typeof name === "string" && name.length > 0 ? { name } : {}),
    ...(id ? { id } : {}),
    ...(aliases.length > 0 ? { aliases } : {}),
  };
}

/** Stored items name their capture time by the conversation's end. */
export function fillCapturedAt(value: unknown): unknown {
  if (!isRecord(value) || value["capturedAt"] !== undefined) return value;
  const timeRange = value["timeRange"];
  const end = isRecord(timeRange) ? timeRange["end"] : undefined;
  return typeof end === "string" ? { ...value, capturedAt: end } : value;
}
