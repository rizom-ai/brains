import { parseMarkdown } from "@brains/utils/markdown";
import { z } from "@brains/utils/zod";
import { siteMetadataCTASchema, siteMetadataSchema } from "./metadata";

/**
 * CTA schema - call-to-action configuration.
 */
export const siteInfoCTASchema: typeof siteMetadataCTASchema =
  siteMetadataCTASchema;

type SiteInfoBaseSchema = ReturnType<
  typeof siteMetadataSchema.omit<{
    url: true;
    analyticsScript: true;
  }>
>;

const siteInfoBaseSchema: SiteInfoBaseSchema = siteMetadataSchema.omit({
  url: true,
  analyticsScript: true,
});

type SiteInfoBodySchema = ReturnType<
  typeof siteInfoBaseSchema.extend<{
    title: z.ZodOptional<z.ZodString>;
    description: z.ZodOptional<z.ZodString>;
  }>
>;

export const siteInfoBodySchema: SiteInfoBodySchema = siteInfoBaseSchema.extend(
  {
    title: z.string().optional().describe("Optional site title override"),
    description: z
      .string()
      .optional()
      .describe("Optional site description override"),
  },
);

/**
 * Site info body type
 */
export type SiteInfoBody = z.output<typeof siteInfoBodySchema>;
export type SiteInfoBodyInput = z.input<typeof siteInfoBodySchema>;
export type ResolvedSiteInfoBody = SiteInfoBody & {
  title: string;
  description: string;
};

/**
 * CTA configuration type
 */
export type SiteInfoCTA = NonNullable<SiteInfoBody["cta"]>;

/**
 * Parse a site-info entity's frontmatter body from its markdown content.
 */
export function parseSiteInfoContent(content: string): SiteInfoBody {
  return siteInfoBodySchema.parse(parseMarkdown(content).frontmatter);
}

/**
 * Minimal reader for the well-known singleton site-info entity. Satisfied
 * structurally by the entity service so entity packages and site datasources
 * can share the lookup without depending on the site-info entity package.
 */
export interface SiteInfoEntityReader {
  listEntities(request: {
    entityType: string;
    options?: { limit?: number };
  }): Promise<{ content: string }[]>;
}

/**
 * Fetch and parse the site-info entity.
 * Returns the full SiteInfoBody (title, description, cta, themeMode, etc.).
 */
export async function fetchSiteInfo(
  reader: SiteInfoEntityReader,
): Promise<SiteInfoBody> {
  const entities = await reader.listEntities({
    entityType: "site-info",
    options: { limit: 1 },
  });
  const entity = entities[0];
  if (!entity) {
    throw new Error("Site info not found — create a site-info entity");
  }
  return parseSiteInfoContent(entity.content);
}
