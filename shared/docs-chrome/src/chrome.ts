import { z } from "@brains/utils/zod";

/** A link in the docs header or footer; `area` marks it current on that area's pages. */
export const docsChromeLinkSchema: z.ZodObject<{
  label: z.ZodString;
  href: z.ZodString;
  area: z.ZodDefault<z.ZodNullable<z.ZodString>>;
}> = z.object({
  label: z.string(),
  href: z.string(),
  area: z.string().nullable().default(null),
});

/** Where the docs belong: a name, a link, and optionally a wordmark (ink.suffix). */
export const docsChromeBrandSchema: z.ZodObject<{
  label: z.ZodString;
  href: z.ZodString;
  wordmark: z.ZodDefault<
    z.ZodNullable<
      z.ZodObject<{
        ink: z.ZodString;
        suffix: z.ZodDefault<z.ZodNullable<z.ZodString>>;
      }>
    >
  >;
}> = z.object({
  label: z.string(),
  href: z.string(),
  wordmark: z
    .object({ ink: z.string(), suffix: z.string().nullable().default(null) })
    .nullable()
    .default(null),
});

/**
 * The docs pages' own header and footer, for a site whose layout draws none.
 * The first link stays in the header on narrow screens; the rest fold away.
 */
export const docsChromeSchema: z.ZodObject<{
  brand: typeof docsChromeBrandSchema;
  links: z.ZodDefault<z.ZodArray<typeof docsChromeLinkSchema>>;
  cta: z.ZodDefault<
    z.ZodNullable<z.ZodObject<{ label: z.ZodString; href: z.ZodString }>>
  >;
  footer: z.ZodDefault<
    z.ZodNullable<
      z.ZodObject<{
        brand: z.ZodDefault<z.ZodNullable<typeof docsChromeBrandSchema>>;
        links: z.ZodDefault<z.ZodArray<typeof docsChromeLinkSchema>>;
      }>
    >
  >;
}> = z.object({
  brand: docsChromeBrandSchema,
  links: z.array(docsChromeLinkSchema).default([]),
  cta: z
    .object({ label: z.string(), href: z.string() })
    .nullable()
    .default(null),
  footer: z
    .object({
      brand: docsChromeBrandSchema.nullable().default(null),
      links: z.array(docsChromeLinkSchema).default([]),
    })
    .nullable()
    .default(null),
});

export type DocsChrome = z.output<typeof docsChromeSchema>;
export type DocsChromeBrand = z.output<typeof docsChromeBrandSchema>;
export type DocsChromeLink = z.output<typeof docsChromeLinkSchema>;
