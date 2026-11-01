import { docsChromeSchema } from "@brains/docs-chrome";
import { z } from "@brains/utils/zod";

/** The docs index's opening copy: a label over the title, its accent, and a lead. */
export const docsHeroSchema: z.ZodObject<{
  label: z.ZodDefault<z.ZodNullable<z.ZodString>>;
  title: z.ZodString;
  accent: z.ZodDefault<z.ZodNullable<z.ZodString>>;
  lead: z.ZodDefault<z.ZodNullable<z.ZodString>>;
}> = z.object({
  label: z.string().nullable().default(null),
  title: z.string(),
  accent: z.string().nullable().default(null),
  lead: z.string().nullable().default(null),
});

/**
 * How the docs pages present themselves. Both are optional: without them the
 * index opens on plain "Documentation" and the pages draw no header or footer
 * brand of their own, for a site whose layout brings its own.
 */
export const docsConfigSchema: z.ZodObject<{
  hero: z.ZodOptional<typeof docsHeroSchema>;
  chrome: z.ZodOptional<typeof docsChromeSchema>;
}> = z.object({
  hero: docsHeroSchema.optional(),
  chrome: docsChromeSchema.optional(),
});

export type DocsHero = z.output<typeof docsHeroSchema>;
export type DocsConfig = z.output<typeof docsConfigSchema>;
export type DocsConfigInput = z.input<typeof docsConfigSchema>;
