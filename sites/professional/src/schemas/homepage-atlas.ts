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
 * The build re-validates enriched data with this schema, so the enrichment
 * fields are declared here; types the site does not display stay unlinked.
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
  url: z.ZodDefault<z.ZodNullable<z.ZodString>>;
  typeLabel: z.ZodDefault<z.ZodNullable<z.ZodString>>;
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
  // Null until enrichment links it; JSON has no undefined.
  url: z.string().nullable().default(null),
  typeLabel: z.string().nullable().default(null),
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
export type HomepageAtlasData = NonNullable<
  z.output<typeof homepageAtlasSchema>
>;
