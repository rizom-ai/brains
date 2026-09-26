import { z } from "@brains/utils/zod";

/** The shape a mark is drawn with; the site decides which kind gets which. */
export const atlasGlyphSchema: z.ZodEnum<{
  dot: "dot";
  diamond: "diamond";
  square: "square";
}> = z.enum(["dot", "diamond", "square"]);

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
  entityType: z.ZodString;
  glyph: typeof atlasGlyphSchema;
  kindLabel: z.ZodDefault<z.ZodNullable<z.ZodString>>;
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
  entityType: z.string(),
  glyph: atlasGlyphSchema,
  /** Names the mark's kind on its card and in the legend, before the type label. */
  kindLabel: z.string().nullable().default(null),
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

/** What the map is drawn around, when it has a centre: the brain itself. */
export const atlasCentreSchema: z.ZodObject<{
  name: z.ZodString;
  url: z.ZodDefault<z.ZodNullable<z.ZodString>>;
}> = z.object({
  name: z.string(),
  url: z.string().nullable().default(null),
});

export const homepageAtlasSchema: z.ZodDefault<
  z.ZodNullable<
    z.ZodObject<{
      zones: z.ZodArray<typeof atlasZoneSchema>;
      items: z.ZodArray<typeof atlasItemSchema>;
      centre: z.ZodDefault<z.ZodNullable<typeof atlasCentreSchema>>;
    }>
  >
> = z
  .object({
    zones: z.array(atlasZoneSchema),
    items: z.array(atlasItemSchema),
    centre: atlasCentreSchema.nullable().default(null),
  })
  .nullable()
  .default(null);

export type AtlasGlyph = z.output<typeof atlasGlyphSchema>;
export type AtlasZone = z.output<typeof atlasZoneSchema>;
export type AtlasItem = z.output<typeof atlasItemSchema>;
export type AtlasCentre = z.output<typeof atlasCentreSchema>;
export type HomepageAtlasData = NonNullable<
  z.output<typeof homepageAtlasSchema>
>;
