import { z } from "@brains/utils/zod";

// Kept free of plugin imports: the docs sync script validates guide sources
// with this schema through the package's `./frontmatter` export.

export const guideRecipeSchema: z.ZodEnum<{
  personal: "personal";
  professional: "professional";
  team: "team";
}> = z.enum(["personal", "professional", "team"]);

export const guideMaterialSchema: z.ZodObject<{
  from: z.ZodString;
  where: z.ZodString;
  becomes: z.ZodString;
  how: z.ZodString;
}> = z.object({
  from: z.string(),
  where: z.string(),
  /** An entity type name, so the material map labels it as Studio does. */
  becomes: z.string(),
  how: z.string(),
});

export const guideFrontmatterSchema: z.ZodObject<{
  title: z.ZodString;
  slug: z.ZodString;
  order: z.ZodNumber;
  persona: z.ZodString;
  for: z.ZodString;
  recipe: z.ZodDefault<z.ZodNullable<typeof guideRecipeSchema>>;
  brings: z.ZodDefault<z.ZodNullable<z.ZodArray<z.ZodString>>>;
  material: z.ZodArray<typeof guideMaterialSchema>;
}> = z.object({
  title: z.string(),
  slug: z.string(),
  order: z.number().int(),
  persona: z.string(),
  for: z.string(),
  /** The recipe the guide starts from; the self-hosting guide has none.
   *  Absent reads as null, which keeps rendered guide data JSON. */
  recipe: guideRecipeSchema.nullable().default(null),
  /** What the guide uses from its recipe, shown in the start section in
   *  place of the recipe's own lines; absent, the recipe's lines show. */
  brings: z.array(z.string().min(1)).min(1).nullable().default(null),
  material: z.array(guideMaterialSchema),
});

export type GuideRecipe = z.output<typeof guideRecipeSchema>;
export type GuideMaterial = z.output<typeof guideMaterialSchema>;
export type GuideFrontmatter = z.output<typeof guideFrontmatterSchema>;
