import type {
  BaseDataSourceContext,
  DataSource,
  DataSourceSchema,
} from "@brains/plugins";
import { compareIds } from "@brains/utils/sort";
import { z } from "@brains/utils/zod";
import { guideSchema, guideWithDataSchema } from "../schemas/guide";
import { sortGuides } from "../lib/guide-order";
import { parseGuideData } from "./guide-datasource";

/** The slug of the docs landing page, which the sections introduce. */
const DOCS_INDEX_SLUG = "index";
const LIST_LIMIT = 1000;

/**
 * What a section lists of a doc, read from the doc entity's metadata. Entity
 * packages do not import one another, so the guides read docs by this
 * contract rather than through the docs plugin.
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

function sortDocs(docs: SectionDoc[]): SectionDoc[] {
  return [...docs].sort(
    (a, b) =>
      a.order - b.order ||
      a.title.localeCompare(b.title) ||
      compareIds(a.id, b.id),
  );
}

/**
 * Each docs section with its docs and the guides listed with it, for a docs
 * page that shows guides beside the reference they lead into. Sections keep
 * the order of their docs; a guide joins the section it names, and a guide
 * naming no section, or one without docs, is left to list on its own.
 */
export class GuideSectionsDataSource implements DataSource {
  readonly id = "guides:sections";
  readonly name = "Guides by Docs Section DataSource";
  readonly description =
    "Each docs section's docs, with the guides listed with that section";

  async fetch<T>(
    _query: unknown,
    outputSchema: DataSourceSchema<T>,
    context: BaseDataSourceContext,
  ): Promise<T> {
    const [docEntities, guideEntities] = await Promise.all([
      context.entityService.listEntities({
        entityType: "doc",
        options: { limit: LIST_LIMIT },
      }),
      context.entityService.listEntities(
        { entityType: "guide", options: { limit: LIST_LIMIT } },
        guideSchema,
      ),
    ]);

    const docs = sortDocs(
      docEntities.map((entity) =>
        sectionDocSchema.parse({ ...entity.metadata, id: entity.id }),
      ),
    ).filter((item) => item.slug !== DOCS_INDEX_SLUG);
    const guides = sortGuides(guideEntities.map(parseGuideData));

    const sections = new Map<string, GuideSection>();
    for (const item of docs) {
      const section = sections.get(item.section) ?? {
        name: item.section,
        guides: [],
        docs: [],
      };
      section.docs.push(item);
      sections.set(item.section, section);
    }
    for (const item of guides) {
      // The section comes from the guide's content, not its stored metadata,
      // which a brain imported before the field existed and kept unchanged.
      const name = item.frontmatter.section;
      if (name) sections.get(name)?.guides.push(item);
    }

    const data: GuideSectionsData = { sections: [...sections.values()] };
    return outputSchema.parse(data);
  }
}
