import type { Entity } from "./schema/entities";
import { z } from "@brains/utils/zod";
import { normalizeContentVisibility, type ContentVisibility } from "./types";

const metadataSchema = z.record(z.string(), z.unknown());

/**
 * Normalized entity row shape used by query and serialization layers.
 * Database timestamps are stored as Unix milliseconds; serializers expose ISO strings.
 */
export interface EntityData {
  id: string;
  entityType: string;
  content: string;
  contentHash: string;
  visibility: ContentVisibility;
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
    visibility: normalizeContentVisibility(row.visibility),
    created: row.created,
    updated: row.updated,
    metadata: metadataSchema.parse(row.metadata),
  };
}
