import { z } from "@brains/utils/zod";
import { guideWithDataSchema } from "./guide";

/**
 * What a section lists of a doc, read from the doc entity's metadata. Entity
 * packages do not import one another, so the guides read docs by this
 * contract rather than through the docs package.
 */
export const sectionDocSchema: z.ZodObject<{
  id: z.ZodString;
  title: z.ZodString;
  section: z.ZodString;
  order: z.ZodNumber;
  slug: z.ZodString;
  description: z.ZodDefault<z.ZodNullable<z.ZodString>>;
}> = z.object({
  id: z.string(),
  title: z.string(),
  section: z.string(),
  order: z.number().int(),
  slug: z.string(),
  description: z.string().nullable().default(null),
});

export const guideSectionSchema: z.ZodObject<{
  name: z.ZodString;
  guides: z.ZodArray<typeof guideWithDataSchema>;
  docs: z.ZodArray<typeof sectionDocSchema>;
}> = z.object({
  name: z.string(),
  guides: z.array(guideWithDataSchema),
  docs: z.array(sectionDocSchema),
});

export const guideSectionsSchema: z.ZodObject<{
  sections: z.ZodArray<typeof guideSectionSchema>;
}> = z.object({ sections: z.array(guideSectionSchema) });

export type SectionDoc = z.output<typeof sectionDocSchema>;
export type GuideSection = z.output<typeof guideSectionSchema>;
export type GuideSectionsData = z.output<typeof guideSectionsSchema>;
