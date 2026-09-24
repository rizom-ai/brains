import { z } from "@brains/utils/zod";

/** The published kinds the atlas places: essays, talks and projects. */
export const atlasEntityTypeSchema: z.ZodEnum<{
  post: "post";
  deck: "deck";
  project: "project";
}> = z.enum(["post", "deck", "project"]);

export const atlasZoneSchema: z.ZodObject<{
  id: z.ZodString;
  name: z.ZodString;
  x: z.ZodNumber;
  y: z.ZodNumber;
  members: z.ZodNumber;
}> = z.object({
  id: z.string(),
  name: z.string(),
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  /** Shown items filed under this territory; a zone without any is dropped. */
  members: z.number().int().positive(),
});

/**
 * An entity-shaped mark: `entityType`, `content` and `metadata.slug` let
 * site-builder enrichment add its URL and type label, as for posts and decks.
 */
export const atlasItemSchema: z.ZodObject<{
  id: z.ZodString;
  entityType: typeof atlasEntityTypeSchema;
  content: z.ZodString;
  metadata: z.ZodObject<{ slug: z.ZodString }>;
  title: z.ZodString;
  year: z.ZodNullable<z.ZodNumber>;
  x: z.ZodNumber;
  y: z.ZodNumber;
  zoneId: z.ZodNullable<z.ZodString>;
}> = z.object({
  id: z.string(),
  entityType: atlasEntityTypeSchema,
  content: z.string(),
  metadata: z.object({ slug: z.string() }),
  title: z.string(),
  year: z.number().int().nullable(),
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  zoneId: z.string().nullable(),
});

export const homepageAtlasSchema: z.ZodDefault<
  z.ZodNullable<
    z.ZodObject<{
      zones: z.ZodArray<typeof atlasZoneSchema>;
      items: z.ZodArray<typeof atlasItemSchema>;
    }>
  >
> = z
  .object({ zones: z.array(atlasZoneSchema), items: z.array(atlasItemSchema) })
  .nullable()
  .default(null);

export type AtlasZone = z.output<typeof atlasZoneSchema>;
export type AtlasItem = z.output<typeof atlasItemSchema>;
export type HomepageAtlas = NonNullable<z.output<typeof homepageAtlasSchema>>;

/** Enrichment adds links only for types the site displays; a mark without one renders unlinked. */
export type AtlasItemView = AtlasItem & {
  url?: string | undefined;
  typeLabel?: string | undefined;
};
export interface HomepageAtlasView {
  zones: AtlasZone[];
  items: AtlasItemView[];
}
