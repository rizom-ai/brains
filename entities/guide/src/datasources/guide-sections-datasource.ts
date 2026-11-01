import {
  docSchema,
  docWithDataSchema,
  parseDocData,
  type DocWithData,
} from "@brains/doc";
import type {
  BaseDataSourceContext,
  DataSource,
  DataSourceSchema,
} from "@brains/plugins";
import { z } from "@brains/utils/zod";
import { guideSchema, guideWithDataSchema } from "../schemas/guide";
import { sortGuides } from "../lib/guide-order";
import { parseGuideData } from "./guide-datasource";

/** The slug of the docs landing page, which the sections introduce. */
const DOCS_INDEX_SLUG = "index";
const LIST_LIMIT = 1000;

export const guideSectionSchema: z.ZodObject<{
  name: z.ZodString;
  guides: z.ZodArray<typeof guideWithDataSchema>;
  docs: z.ZodArray<typeof docWithDataSchema>;
}> = z.object({
  name: z.string(),
  guides: z.array(guideWithDataSchema),
  docs: z.array(docWithDataSchema),
});

export const guideSectionsSchema: z.ZodObject<{
  sections: z.ZodArray<typeof guideSectionSchema>;
}> = z.object({ sections: z.array(guideSectionSchema) });

export type GuideSection = z.output<typeof guideSectionSchema>;
export type GuideSectionsData = z.output<typeof guideSectionsSchema>;

function sortDocs(docs: DocWithData[]): DocWithData[] {
  return [...docs].sort((a, b) => {
    const order = a.metadata.order - b.metadata.order;
    if (order !== 0) return order;
    return a.metadata.title.localeCompare(b.metadata.title);
  });
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
      context.entityService.listEntities(
        { entityType: "doc", options: { limit: LIST_LIMIT } },
        docSchema,
      ),
      context.entityService.listEntities(
        { entityType: "guide", options: { limit: LIST_LIMIT } },
        guideSchema,
      ),
    ]);

    const docs = sortDocs(docEntities.map(parseDocData)).filter(
      (item) => item.metadata.slug !== DOCS_INDEX_SLUG,
    );
    const guides = sortGuides(guideEntities.map(parseGuideData));

    const sections = new Map<string, GuideSection>();
    for (const item of docs) {
      const name = item.metadata.section;
      const section = sections.get(name) ?? { name, guides: [], docs: [] };
      section.docs.push(item);
      sections.set(name, section);
    }
    for (const item of guides) {
      const name = item.metadata.section;
      if (name) sections.get(name)?.guides.push(item);
    }

    const data: GuideSectionsData = { sections: [...sections.values()] };
    return outputSchema.parse(data);
  }
}
