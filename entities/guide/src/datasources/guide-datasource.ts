import {
  BaseEntityDataSource,
  parseMarkdownWithFrontmatter,
} from "@brains/plugins";
import type {
  BaseDataSourceContext,
  DataSourceSchema,
  EntityDataSourceConfig,
} from "@brains/plugins";
import type { Logger } from "@brains/utils/logger";
import {
  guideSchema,
  guideWithDataSchema,
  type Guide,
  type GuideWithData,
} from "../schemas/guide";
import { guideFrontmatterSchema } from "../schemas/guide-frontmatter";
import { sortGuides } from "../lib/guide-order";

interface GuideDetailData {
  guide: GuideWithData;
  otherGuides: GuideWithData[];
}

interface GuideListData {
  guides: GuideWithData[];
}

export function parseGuideData(entity: Guide): GuideWithData {
  const parsed = parseMarkdownWithFrontmatter(
    entity.content,
    guideFrontmatterSchema,
  );

  return guideWithDataSchema.parse({
    ...entity,
    frontmatter: parsed.metadata,
    body: parsed.content,
  });
}

export class GuideDataSource extends BaseEntityDataSource<
  Guide,
  GuideWithData,
  GuideListData
> {
  readonly id = "guides:entities";
  readonly name = "Guides Entity DataSource";
  readonly description = "Fetches and transforms guide entities for rendering";

  protected readonly config: EntityDataSourceConfig<Guide> = {
    entityType: "guide",
    entitySchema: guideSchema,
    defaultSort: [
      { field: "order" as const, direction: "asc" as const },
      { field: "title" as const, direction: "asc" as const },
    ],
    defaultLimit: 100,
  };

  constructor(logger: Logger) {
    super(logger);
  }

  protected transformEntity(entity: Guide): GuideWithData {
    return parseGuideData(entity);
  }

  override async fetch<T>(
    query: unknown,
    outputSchema: DataSourceSchema<T>,
    context: BaseDataSourceContext,
  ): Promise<T> {
    const params = this.parseQuery(query);
    const list = await this.fetchList({ limit: 1000 }, context.entityService);

    if (!params.query.id) {
      return outputSchema.parse(this.buildListResult(list.items));
    }

    // The closing links name every other guide, so the detail reads them all.
    const detail = await this.fetchDetail(
      params.query.id,
      context.entityService,
    );
    const data: GuideDetailData = {
      guide: detail.item,
      otherGuides: sortGuides(
        list.items.filter((item) => item.id !== detail.item.id),
      ),
    };
    return outputSchema.parse(data);
  }

  protected buildListResult(items: GuideWithData[]): GuideListData {
    return { guides: sortGuides(items) };
  }
}
