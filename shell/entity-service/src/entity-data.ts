import type { Entity } from "./schema/entities";

/**
 * Normalized entity row shape used by query and serialization layers.
 * Database timestamps are stored as Unix milliseconds; serializers expose ISO strings.
 */
export interface EntityData {
  id: string;
  entityType: string;
  content: string;
  contentHash: string;
  created: number;
  updated: number;
  metadata: Record<string, unknown>;
}

/**
 * Convert a Drizzle entity row into the normalized shape consumed by serializers.
 */
export function normalizeEntityRow(row: Entity): EntityData {
  return {
    id: row.id,
    entityType: row.entityType,
    content: row.content,
    contentHash: row.contentHash,
    created: row.created,
    updated: row.updated,
    metadata: (row.metadata as Record<string, unknown> | null) ?? {},
  };
}
