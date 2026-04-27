import {
  BaseEntityDataSource,
  parseMarkdownWithFrontmatter,
} from "@brains/plugins";
import type {
  BaseDataSourceContext,
  BaseQuery,
  NavigationResult,
  PaginationInfo,
} from "@brains/plugins";
import type { Logger } from "@brains/utils";
import type { z } from "@brains/utils";
import type { Doc } from "../schemas/doc";
import {
  docFrontmatterSchema,
  docWithDataSchema,
  type DocWithData,
} from "../schemas/doc";

export type { DocWithData };

interface DocDetailData {
  doc: DocWithData;
  docs: DocWithData[];
  prevDoc: DocWithData | null;
  nextDoc: DocWithData | null;
}

interface DocListData {
  docs: DocWithData[];
  pagination: PaginationInfo | null;
  baseUrl: string | undefined;
}

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

export class DocDataSource extends BaseEntityDataSource<Doc, DocWithData> {
  readonly id = "docs:entities";
  readonly name = "Docs Entity DataSource";
  readonly description = "Fetches and transforms doc entities for rendering";

  protected readonly config = {
    entityType: "doc",
    defaultSort: [
      { field: "order" as const, direction: "asc" as const },
      { field: "section" as const, direction: "asc" as const },
      { field: "title" as const, direction: "asc" as const },
    ],
    defaultLimit: 100,
    enableNavigation: true,
  };

  constructor(logger: Logger) {
    super(logger);
  }

  protected transformEntity(entity: Doc): DocWithData {
    return parseDocData(entity);
  }

  override async fetch<T>(
    query: unknown,
    outputSchema: z.ZodSchema<T>,
    context: BaseDataSourceContext,
  ): Promise<T> {
    const params = this.parseQuery(query);

    if (!params.query.id) {
      return super.fetch(query, outputSchema, context);
    }

    const [detail, list] = await Promise.all([
      this.fetchDetail(params.query.id, context.entityService),
      this.fetchList({ limit: 1000 }, context.entityService),
    ]);

    const docs = sortDocsForDisplay(list.items);
    const currentIndex = docs.findIndex((item) => item.id === detail.item.id);
    const prevDoc = currentIndex > 0 ? docs[currentIndex - 1] : null;
    const nextDoc =
      currentIndex >= 0 && currentIndex < docs.length - 1
        ? docs[currentIndex + 1]
        : null;

    return outputSchema.parse({
      doc: detail.item,
      docs,
      prevDoc,
      nextDoc,
    });
  }

  protected override buildDetailResult(
    item: DocWithData,
    navigation: NavigationResult<DocWithData> | null,
  ): DocDetailData {
    return {
      doc: item,
      docs: [item],
      prevDoc: navigation?.prev ?? null,
      nextDoc: navigation?.next ?? null,
    };
  }

  protected buildListResult(
    items: DocWithData[],
    pagination: PaginationInfo | null,
    query: BaseQuery,
  ): DocListData {
    return {
      docs: sortDocsForDisplay(items),
      pagination,
      baseUrl: query.baseUrl,
    };
  }
}
