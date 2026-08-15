import {
  defineEntityDataSource,
  parseMarkdownWithFrontmatter,
} from "@brains/sdk/entities";
import type {
  AnyEntityDataSourceDefinition,
  BaseQuery,
  PaginationInfo,
} from "@brains/sdk/entities";
import type { Doc } from "../schemas/doc";
import {
  docFrontmatterSchema,
  docWithDataSchema,
  type DocWithData,
} from "../schemas/doc";

export type { DocWithData };

function sortDocsForDisplay(docs: DocWithData[]): DocWithData[] {
  return [...docs].sort((a, b) => {
    const order = a.metadata.order - b.metadata.order;
    if (order !== 0) return order;
    return a.metadata.title.localeCompare(b.metadata.title);
  });
}

export function parseDocData(entity: Doc): DocWithData {
  const parsed = parseMarkdownWithFrontmatter(
    entity.content,
    docFrontmatterSchema,
  );

  return docWithDataSchema.parse({
    ...entity,
    frontmatter: parsed.metadata,
    body: parsed.content,
  });
}

/**
 * Docs render as one long ordered set rather than paged results, so the
 * list view takes a high limit and reports no pagination, and the detail
 * view derives prev/next from the display order rather than the storage
 * sort.
 */
export const docDataSource: AnyEntityDataSourceDefinition =
  defineEntityDataSource({
    id: "entities",
    name: "Docs Entity DataSource",
    description: "Fetches and transforms doc entities for rendering",
    entityType: "doc",
    defaultSort: [
      { field: "order", direction: "asc" },
      { field: "section", direction: "asc" },
      { field: "title", direction: "asc" },
    ],
    defaultLimit: 1000,
    enableNavigation: true,
    transform: (entity: Doc): DocWithData => parseDocData(entity),
    list: (
      items: DocWithData[],
      _pagination: PaginationInfo | null,
      query: BaseQuery,
    ) => ({
      docs: sortDocsForDisplay(items),
      pagination: null,
      baseUrl: query.baseUrl ?? null,
    }),
    detail: ({ item, siblings }) => {
      const docs = sortDocsForDisplay([...siblings]);
      const index = docs.findIndex((entry) => entry.id === item.id);
      return {
        doc: item,
        docs,
        prevDoc: index > 0 ? (docs[index - 1] ?? null) : null,
        nextDoc:
          index >= 0 && index < docs.length - 1
            ? (docs[index + 1] ?? null)
            : null,
      };
    },
  });
