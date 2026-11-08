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

/** The nested person shape stored before the trim; any other key is not one. */
const nestedPersonSchema = z.strictObject({
  identity: z.unknown().optional(),
  identityAliases: z.unknown().optional(),
  displayName: z.unknown().optional(),
});

/**
 * A person stored as a nested identity, read flat: `{ name, id, aliases }`.
 * Any other shape is left for the flat schema to accept or refuse.
 */
export function flattenStoredPerson(value: unknown): unknown {
  if (!isRecord(value) || !nestedPersonSchema.safeParse(value).success) {
    return value;
  }
  const identity = actorRefSchema.safeParse(value["identity"]);
  const id = identity.success ? actorRefKey(identity.data) : undefined;
  const aliases = z
    .array(actorRefSchema)
    .catch([])
    .parse(value["identityAliases"] ?? [])
    .map(actorRefKey)
    .filter((alias) => alias !== id);
  const name = value["displayName"];
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
