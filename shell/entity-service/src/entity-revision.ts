import { computeContentHash } from "@brains/utils/hash";
import { isRecord } from "@brains/utils/is-record";

function toStableJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) =>
      item === undefined ? null : toStableJsonValue(item),
    );
  }
  if (isRecord(value)) {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, item]) => item !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, toStableJsonValue(item)]),
    );
  }
  return value;
}

export function stableJson(value: unknown): string {
  return JSON.stringify(toStableJsonValue(value));
}

/**
 * The revision of a stored entity, derived from the columns a writer can
 * change: content hash, metadata, and visibility. Because it is computed from
 * the row rather than minted on write, every writer is covered, including
 * direct SQL, without a version table or triggers. Timestamps are excluded so
 * an identical state is the same revision.
 */
export function entityRevision({
  contentHash,
  metadata,
  visibility,
}: {
  contentHash: string;
  metadata: unknown;
  visibility: string;
}): string {
  // Pick explicitly: a full row carries timestamps that must not affect the token.
  return computeContentHash(stableJson({ contentHash, metadata, visibility }));
}
