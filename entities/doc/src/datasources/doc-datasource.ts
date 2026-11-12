import type { DocsChrome } from "@brains/docs-chrome";
import {
  defineDataSource,
  z,
  type DataSourceDefinition,
  type EntityOf,
} from "@brains/sdk/entities";
import { generateMarkdown } from "@brains/utils/markdown-frontmatter";
import type { DocsConfig, DocsHero } from "../config";
import { doc } from "../doc";
import { docWithDataSchema, type DocWithData } from "../schemas/doc";
import { sortDocs } from "../templates/docs-design";

export type { DocWithData };

type Doc = EntityOf<typeof doc>;

/** How many docs a page reads, as the class's list and navigation did. */
const DOCS_LIMIT = 1000;

const docsQuerySchema = z.looseObject({
  query: z
    .looseObject({
      id: z.string().optional(),
      baseUrl: z.string().optional(),
    })
    .optional(),
});

/**
 * A doc as the templates read it: its record with its frontmatter and its
 * body, and its content the document it is stored as.
 */
export function parseDocData(entity: Doc): DocWithData {
  const { title, section, order, description, slug, authoredSlug } =
    entity.metadata;
  const frontmatter = {
    title,
    section,
    order,
    description,
    slug: authoredSlug === true ? slug : null,
  };
  const stated = Object.fromEntries(
    Object.entries(frontmatter).filter(([, value]) => value !== null),
  );
  return docWithDataSchema.parse({
    ...entity,
    content: generateMarkdown(stated, entity.content),
    metadata: { title, section, order, description, slug },
    frontmatter,
    body: entity.content,
  });
}

/**
 * The docs the templates render, with the configured hero and chrome: every
 * doc for a list, and for a query naming a slug, that doc with the docs
 * around it in reading order.
 */
export function docDataSource(presentation: DocsConfig): DataSourceDefinition {
  const hero: DocsHero | null = presentation.hero ?? null;
  const chrome: DocsChrome | null = presentation.chrome ?? null;
  return defineDataSource({
    id: "entities",
    name: "Docs Entity DataSource",
    description: "Fetches and transforms doc entities for rendering",
    fetch: async (raw, entities) => {
      const query = docsQuerySchema.parse(raw).query ?? {};
      const docs = sortDocs(
        (
          await entities.list(doc, {
            limit: DOCS_LIMIT,
            sort: [
              { field: "order", direction: "asc" },
              { field: "section", direction: "asc" },
              { field: "title", direction: "asc" },
            ],
          })
        ).map(parseDocData),
      );
      if (query.id === undefined) {
        return {
          docs,
          pagination: null,
          baseUrl: query.baseUrl ?? null,
          hero,
          chrome,
        };
      }
      const index = docs.findIndex((item) => item.metadata.slug === query.id);
      const current = docs[index];
      if (!current) throw new Error(`doc not found with slug: ${query.id}`);
      return {
        doc: current,
        docs,
        prevDoc: index > 0 ? (docs[index - 1] ?? null) : null,
        nextDoc: docs[index + 1] ?? null,
        chrome,
      };
    },
  });
}
