import { defineEntity, type EntityDefinition } from "@brains/sdk/entities";
import { storedFormCodec } from "@brains/sdk/internal/entity-runtime";
import {
  StructuredContentFormatter,
  type FieldMapping,
} from "@brains/content-formatters";
import {
  siteInfoBodySchema,
  siteMetadataTranslationSchema,
} from "@brains/site-composition";
import { isPlainRecord } from "@brains/utils/predicates";
import { z } from "@brains/utils/zod";

// Legacy: also reads the header form written before 0.2.0-alpha.760; removed with stored-form-old-headers (docs/legacy-code-inventory.json).

export const SITE_INFO = "site-info" as const;

/** The call-to-action fields the new form keeps in the header, flat. */
const flatCtaShape = {
  ctaHeading: z.string().optional().describe("Main CTA heading text"),
  ctaButtonText: z.string().optional().describe("Call-to-action button text"),
  ctaButtonLink: z
    .string()
    .optional()
    .describe("URL or anchor for the CTA button"),
};

/**
 * The new form's header (docs/external-plugin-authoring.md, The stored format): only what Obsidian
 * shows as a property. The call to action is three flat keys; its subtitle,
 * the section blurbs and the translations are in the body.
 */
const newHeaderSchema = siteInfoBodySchema
  .omit({ cta: true, sections: true, translations: true })
  .extend(flatCtaShape);

const bodySchema = z.object({
  subtitle: z.string().optional(),
  sections: z
    .record(z.string(), z.object({ blurb: z.string().optional() }))
    .optional(),
  translations: z.record(z.string(), siteMetadataTranslationSchema).optional(),
});

type Body = z.output<typeof bodySchema>;

const bodyMappings: FieldMapping[] = [
  { key: "subtitle", label: "Call to action", type: "string" },
  {
    key: "sections",
    label: "Sections",
    type: "record",
    valueMappings: [{ key: "blurb", label: "Blurb", type: "string" }],
  },
  {
    key: "translations",
    label: "Translations",
    type: "record",
    valueMappings: [
      { key: "title", label: "Title", type: "string", line: true },
      { key: "description", label: "Description", type: "string", line: true },
      { key: "copyright", label: "Copyright", type: "string", line: true },
      { key: "cta.heading", label: "CTA heading", type: "string", line: true },
      {
        key: "cta.subtitle",
        label: "CTA subtitle",
        type: "string",
        line: true,
      },
      {
        key: "cta.buttonText",
        label: "CTA button text",
        type: "string",
        line: true,
      },
      {
        key: "cta.buttonLink",
        label: "CTA button link",
        type: "string",
        line: true,
      },
    ],
  },
];

const body = new StructuredContentFormatter<Body>(bodySchema, {
  title: "Site info",
  mappings: bodyMappings,
  layout: "compact",
});

const defined = <T>(
  entries: Record<string, T | undefined>,
): Record<string, T> =>
  Object.fromEntries(
    Object.entries(entries).filter(
      (entry): entry is [string, T] => entry[1] !== undefined,
    ),
  );

/**
 * The site-info record from a document in either form. The new form wins
 * where a file states a field in both: its flat call-to-action keys over a
 * nested `cta`, its body over a header `sections` or `translations`.
 */
function decodeSiteInfo(document: {
  content: string;
  frontmatter: Record<string, unknown>;
}): Record<string, unknown> {
  const {
    ctaHeading,
    ctaButtonText,
    ctaButtonLink,
    cta,
    sections,
    translations,
    ...header
  } = document.frontmatter;
  const fromBody =
    document.content.trim() === "" ? {} : body.parse(document.content);
  const merged = {
    ...(isPlainRecord(cta) ? cta : {}),
    ...defined({
      heading: ctaHeading,
      buttonText: ctaButtonText,
      buttonLink: ctaButtonLink,
      subtitle: fromBody.subtitle,
    }),
  };
  return {
    ...header,
    ...(Object.keys(merged).length > 0 && { cta: merged }),
    ...defined({
      sections: fromBody.sections ?? sections,
      translations: fromBody.translations ?? translations,
    }),
  };
}

type SiteInfoMetadata = z.output<typeof siteInfoBodySchema>;

/** The new form: a flat header, and the rest as the body. */
function encodeNewForm(metadata: SiteInfoMetadata): {
  content: string;
  frontmatter: Record<string, unknown>;
} {
  const { cta, sections, translations, ...header } = metadata;
  return {
    content: body.format(
      defined<unknown>({ subtitle: cta?.subtitle, sections, translations }),
    ),
    frontmatter: {
      ...header,
      ...defined({
        ctaHeading: cta?.heading,
        ctaButtonText: cta?.buttonText,
        ctaButtonLink: cta?.buttonLink,
      }),
    },
  };
}

export type SiteInfoDefinition = EntityDefinition<
  typeof SITE_INFO,
  typeof siteInfoBodySchema
>;

/**
 * The site's own metadata: title, description, call to action, section
 * blurbs and translations. A singleton read as its fields: in memory its
 * metadata keeps one shape whichever form its file is in, so readers never
 * see the difference. It reads the old form (everything in the header) and
 * the new one (a flat header and a body), and writes the one its store writes.
 * Its body is an encoding of its fields, edited in the file, so a read hands
 * back the fields and no body. Configuration rather than content, so it
 * stays out of embeddings and projections.
 */
export function siteInfoDefinition(): SiteInfoDefinition {
  return defineEntity({
    type: SITE_INFO,
    classification: "system",
    purpose: "Singleton configuration describing the published site.",
    metadata: siteInfoBodySchema,
    singleton: true,
    hasBody: false,
    markdown: storedFormCodec<typeof siteInfoBodySchema>({
      decode: (document) => ({
        content: "",
        metadata: decodeSiteInfo(document),
      }),
      encode: ({ metadata }) => encodeNewForm(metadata),
      header: newHeaderSchema,
      oldHeader: siteInfoBodySchema,
    }),
    config: {
      embeddable: false,
      projectionSource: false,
      projectionSourceRole: "excluded",
    },
  });
}
