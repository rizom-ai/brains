import { contentVisibilitySchema } from "@brains/entity-service";
import { z } from "@brains/utils/zod";

/**
 * The stored-entity fields a view schema opens with: the entity as a
 * datasource hands it to a template, with its own metadata and parsed
 * frontmatter. Spread into `z.object` before the view's own fields.
 */
export function entityViewFields<
  TEntityType extends string,
  TMetadata extends z.ZodType,
  TFrontmatter extends z.ZodType,
>(
  entityType: TEntityType,
  metadata: TMetadata,
  frontmatter: TFrontmatter,
): {
  id: z.ZodString;
  entityType: z.ZodLiteral<TEntityType>;
  content: z.ZodString;
  created: z.ZodString;
  updated: z.ZodString;
  visibility: typeof contentVisibilitySchema;
  metadata: TMetadata;
  contentHash: z.ZodString;
  frontmatter: TFrontmatter;
} {
  return {
    id: z.string(),
    entityType: z.literal(entityType),
    content: z.string(),
    created: z.string(),
    updated: z.string(),
    visibility: contentVisibilitySchema,
    metadata,
    contentHash: z.string(),
    frontmatter,
  };
}

/** Shape of {@link entityViewFields}, for annotating a view schema. */
export type EntityViewFields<
  TEntityType extends string,
  TMetadata extends z.ZodType,
  TFrontmatter extends z.ZodType,
> = ReturnType<typeof entityViewFields<TEntityType, TMetadata, TFrontmatter>>;
