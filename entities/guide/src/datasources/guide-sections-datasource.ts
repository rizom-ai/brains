import {
  defineDataSource,
  type DataSourceDefinition,
} from "@brains/sdk/entities";
import { entityRuntime } from "@brains/sdk/internal/entity-runtime";
import {
  sectionDocSchema,
  type GuideSection,
  type GuideSectionsData,
  type SectionDoc,
} from "../schemas/guide-sections";
import { listGuides } from "./guide-datasource";

/** The slug of the docs landing page, which the sections introduce. */
const DOCS_INDEX_SLUG = "index";
const LIST_LIMIT = 1000;

function sortDocs(docs: SectionDoc[]): SectionDoc[] {
  return [...docs].sort((a, b) => {
    const order = a.order - b.order;
    if (order !== 0) return order;
    return a.title.localeCompare(b.title);
  });
}

/**
 * Each docs section with its docs and the guides listed with it, for a docs
 * page that shows guides beside the reference they lead into. Sections keep
 * the order of their docs; a guide joins the section it names, and a guide
 * naming no section, or one without docs, is left to list on its own.
 */
export function guideSectionsDataSource(): DataSourceDefinition {
  return defineDataSource({
    id: "sections",
    name: "Guides by Docs Section DataSource",
    description:
      "Each docs section's docs, with the guides listed with that section",
    fetch: async (_query, entities, context) => {
      const [docEntities, guides] = await Promise.all([
        entityRuntime(context).anyEntities.listEntities({
          entityType: "doc",
          options: { limit: LIST_LIMIT },
        }),
        listGuides(entities),
      ]);

      const docs = sortDocs(
        docEntities.map((entity) =>
          sectionDocSchema.parse({ ...entity.metadata, id: entity.id }),
        ),
      ).filter((item) => item.slug !== DOCS_INDEX_SLUG);

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
        const name = item.frontmatter.section;
        if (name) sections.get(name)?.guides.push(item);
      }

      const data: GuideSectionsData = { sections: [...sections.values()] };
      return data;
    },
  });
}
