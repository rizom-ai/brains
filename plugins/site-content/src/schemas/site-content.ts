import { defineEntity, type EntityOf } from "@brains/sdk/entities";
import { z } from "@brains/utils/zod";

/** A section is addressed by its id, `route:section`; it needs no metadata of its own. */
export const siteContentMetadataSchema: z.ZodObject<
  Record<string, never>,
  z.core.$loose
> = z.looseObject({});

export type SiteContentMetadata = z.output<typeof siteContentMetadataSchema>;

/**
 * A content section bound to a route on the published site, its id
 * `route:section`. A file that keeps a frontmatter key of its own keeps it
 * in its stored document, which a site build reads; the route and section
 * copies an older file carries are retired.
 */
export const siteContentEntity: ReturnType<
  typeof defineEntity<"site-content", typeof siteContentMetadataSchema>
> = defineEntity({
  type: "site-content",
  purpose: "A content section bound to a route on the published site.",
  metadata: siteContentMetadataSchema,
  markdown: {
    decode: ({ content, frontmatter }) => ({
      content,
      metadata: siteContentMetadataSchema.parse(frontmatter),
    }),
    // The body trimmed under the frontmatter, as the class's adapter wrote
    // it: a section with no frontmatter ends at its last line.
    encode: ({ content, metadata }) => ({
      content: content.trim(),
      frontmatter: metadata,
    }),
  },
  // The id is route:section; the resolver reads it, never these copies.
  config: { retiredFields: ["routeId", "sectionId"] },
});

export type SiteContent = EntityOf<typeof siteContentEntity>;
