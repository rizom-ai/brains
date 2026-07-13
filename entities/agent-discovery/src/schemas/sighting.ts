import { baseEntitySchema } from "@brains/plugins";
import { z } from "@brains/utils/zod";
import { SIGHTING_ENTITY_TYPE } from "../lib/constants";
import { agentFrontmatterSchema } from "./agent";

const sightingKindSchema: typeof agentFrontmatterSchema.shape.kind =
  agentFrontmatterSchema.shape.kind;

type SightingFrontmatterSchema = z.ZodObject<{
  name: z.ZodString;
  url: z.ZodURL;
  kind: typeof sightingKindSchema;
  tags: z.ZodArray<z.ZodString>;
  introducedBy: z.ZodArray<z.ZodString>;
  hops: z.ZodNumber;
  cardUri: z.ZodOptional<z.ZodString>;
  sightedAt: z.ZodString;
}>;

/**
 * Sighting frontmatter — a second-order agent reported by a peer's
 * directory, not yet connected. `introducedBy` carries the agent entity
 * ids of the first-order peers whose directories reported it; a sighting
 * without provenance is not a sighting.
 */
export const sightingFrontmatterSchema: SightingFrontmatterSchema = z.object({
  name: z.string(),
  url: z.url(),
  kind: sightingKindSchema,
  tags: z.array(z.string()),
  introducedBy: z.array(z.string()).min(1),
  hops: z.number().int().min(2),
  cardUri: z.string().optional(),
  sightedAt: z.string(),
});

export type SightingFrontmatter = z.infer<typeof sightingFrontmatterSchema>;

type SightingMetadataSchema = z.ZodObject<{
  name: z.ZodString;
  url: z.ZodURL;
  introducedBy: z.ZodArray<z.ZodString>;
  hops: z.ZodNumber;
}>;

export const sightingMetadataSchema: SightingMetadataSchema = z.object({
  name: z.string(),
  url: z.url(),
  introducedBy: z.array(z.string()).min(1),
  hops: z.number().int().min(2),
});

export type SightingMetadata = z.infer<typeof sightingMetadataSchema>;

export const sightingEntitySchema: ReturnType<
  typeof baseEntitySchema.extend<{
    entityType: z.ZodLiteral<typeof SIGHTING_ENTITY_TYPE>;
    metadata: SightingMetadataSchema;
  }>
> = baseEntitySchema.extend({
  entityType: z.literal(SIGHTING_ENTITY_TYPE),
  metadata: sightingMetadataSchema,
});

export type SightingEntity = z.infer<typeof sightingEntitySchema>;
