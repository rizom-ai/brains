import type { DocsChrome } from "@brains/docs-chrome";
import {
  defineDataSource,
  z,
  type DataSourceDefinition,
  type EntityOf,
} from "@brains/sdk/entities";
import { generateMarkdown } from "@brains/utils/markdown-frontmatter";
import type { GuidesConfig } from "../config";
import { guide, statedGuideFields } from "../guide";
import { guideWithDataSchema, type GuideWithData } from "../schemas/guide";
import { sortGuides } from "../lib/guide-order";

type Guide = EntityOf<typeof guide>;

/** How many guides a page reads, as the class's list did. */
const GUIDES_LIMIT = 1000;

const guidesQuerySchema = z.looseObject({
  query: z.looseObject({ id: z.string().optional() }).optional(),
});

/**
 * A guide as the templates read it: its record, its content the document it
 * is stored as, its frontmatter and its body.
 */
export function parseGuideData(entity: Guide): GuideWithData {
  return guideWithDataSchema.parse({
    ...entity,
    content: generateMarkdown(
      statedGuideFields(entity.metadata),
      entity.content,
    ),
    frontmatter: entity.metadata,
    body: entity.content.trim(),
  });
}

/** Every guide, in the order the index and every card list use. */
export async function listGuides(
  entities: Parameters<DataSourceDefinition["fetch"]>[1],
): Promise<GuideWithData[]> {
  return sortGuides(
    (
      await entities.list(guide, {
        limit: GUIDES_LIMIT,
        sort: [
          { field: "order", direction: "asc" },
          { field: "title", direction: "asc" },
        ],
      })
    ).map(parseGuideData),
  );
}

/**
 * The guides the templates render, with the configured chrome: every guide
 * for a list, and for a query naming one by its slug, that guide with every other one,
 * which its closing links name.
 */
export function guideDataSource(
  presentation: GuidesConfig = {},
): DataSourceDefinition {
  const chrome: DocsChrome | null = presentation.chrome ?? null;
  return defineDataSource({
    id: "entities",
    name: "Guides Entity DataSource",
    description: "Fetches and transforms guide entities for rendering",
    fetch: async (raw, entities) => {
      const id = guidesQuerySchema.parse(raw).query?.id;
      const guides = await listGuides(entities);
      if (!id) return { guides, chrome };
      const current = guides.find((item) => item.metadata.slug === id);
      if (!current) throw new Error(`guide not found with slug: ${id}`);
      return {
        chrome,
        guide: current,
        otherGuides: guides.filter((item) => item.id !== current.id),
      };
    },
  });
}
