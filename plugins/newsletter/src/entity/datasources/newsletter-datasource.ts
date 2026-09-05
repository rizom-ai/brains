import {
  BaseEntityDataSource,
  type BaseQuery,
  type EntityDataSourceConfig,
  type PaginationInfo,
} from "@brains/plugins";
import type { BaseDataSourceContext, DataSourceSchema } from "@brains/plugins";
import { parseMarkdownWithFrontmatter } from "@brains/plugins";
import { readString } from "@brains/utils/record-fields";
import type { Logger } from "@brains/utils/logger";
import { truncateText } from "@brains/utils/string-utils";
import { z } from "@brains/utils/zod";
import {
  newsletterFrontmatterSchema,
  newsletterSchema,
  newsletterStatusSchema,
  type Newsletter,
} from "../schemas/newsletter";
import type {
  NewsletterListData,
  NewsletterListItem,
} from "../templates/newsletter-list";

const newsletterQuerySchema: z.ZodObject<
  {
    id: z.ZodOptional<z.ZodString>;
    limit: z.ZodOptional<z.ZodNumber>;
    page: z.ZodOptional<z.ZodNumber>;
    pageSize: z.ZodOptional<z.ZodNumber>;
    baseUrl: z.ZodOptional<z.ZodString>;
    status: z.ZodOptional<typeof newsletterStatusSchema>;
  },
  z.core.$loose
> = z.looseObject({
  id: z.string().optional(),
  limit: z.number().optional(),
  page: z.number().optional(),
  pageSize: z.number().optional(),
  baseUrl: z.string().optional(),
  status: newsletterStatusSchema.optional(),
});

type NewsletterQuery = z.output<typeof newsletterQuerySchema>;

const newsletterInputSchema: z.ZodObject<
  {
    entityType: z.ZodOptional<z.ZodString>;
    query: z.ZodOptional<typeof newsletterQuerySchema>;
  },
  z.core.$loose
> = z.looseObject({
  entityType: z.string().optional(),
  query: newsletterQuerySchema.optional(),
});

/**
 * Extract body content from newsletter (strips frontmatter).
 */
function getNewsletterBody(newsletter: Newsletter): string {
  try {
    const { content } = parseMarkdownWithFrontmatter(
      newsletter.content,
      newsletterFrontmatterSchema,
    );
    return content;
  } catch {
    return newsletter.content;
  }
}

/**
 * DataSource for fetching and transforming newsletter entities.
 * Handles list views with pagination/status filtering and detail views
 * with prev/next navigation and source entity resolution.
 */
export class NewsletterDataSource extends BaseEntityDataSource<
  Newsletter,
  NewsletterListItem,
  NewsletterListData
> {
  readonly id = "newsletter:entities";
  readonly name = "Newsletter Entity DataSource";
  readonly description =
    "Fetches and transforms newsletter entities for rendering";

  protected readonly config: EntityDataSourceConfig<Newsletter> = {
    entityType: "newsletter",
    entitySchema: newsletterSchema,
    defaultSort: [{ field: "created" as const, direction: "desc" as const }],
    defaultLimit: 10,
    lookupField: "id" as const,
    enableNavigation: true,
  };

  constructor(logger: Logger) {
    super(logger);
    this.logger.debug("NewsletterDataSource initialized");
  }

  protected override parseQuery(query: unknown): {
    entityType: string;
    query: NewsletterQuery;
  } {
    const parsed = newsletterInputSchema.parse(query);
    return {
      entityType: parsed.entityType ?? this.config.entityType,
      query: parsed.query ?? {},
    };
  }

  protected transformEntity(entity: Newsletter): NewsletterListItem {
    const body = getNewsletterBody(entity);
    const item: NewsletterListItem = {
      id: entity.id,
      subject: entity.metadata.subject,
      status: entity.metadata.status,
      excerpt: truncateText(body, 150),
      created: entity.created,
      sentAt: entity.metadata.sentAt ?? null,
      url: `/newsletters/${entity.id}`,
    };
    return item;
  }

  protected buildListResult(
    items: NewsletterListItem[],
    pagination: PaginationInfo | null,
    _query: BaseQuery,
  ): NewsletterListData {
    return {
      newsletters: items,
      totalCount: pagination?.totalItems ?? items.length,
      pagination,
    };
  }

  /**
   * Override fetch to handle:
   * - Detail view with source entity resolution (richer than base)
   * - List view with status filtering
   */
  override async fetch<T>(
    query: unknown,
    outputSchema: DataSourceSchema<T>,
    context: BaseDataSourceContext,
  ): Promise<T> {
    const { query: parsedQuery } = this.parseQuery(query);
    const entityService = context.entityService;

    // Detail view — custom because it resolves source entities
    if (parsedQuery.id) {
      return this.fetchSingleNewsletter(
        parsedQuery.id,
        outputSchema,
        entityService,
      );
    }

    // List view — use base fetchList with optional status filter
    const statusFilter = parsedQuery.status;
    const filterOpts = statusFilter
      ? { filter: { metadata: { status: statusFilter } } }
      : undefined;

    const { items, pagination } = await this.fetchList(
      parsedQuery,
      entityService,
      filterOpts,
    );

    return outputSchema.parse(
      this.buildListResult(items, pagination, parsedQuery),
    );
  }

  /**
   * Fetch a single newsletter with full detail data including
   * navigation and source entity resolution.
   */
  private async fetchSingleNewsletter<T>(
    id: string,
    outputSchema: DataSourceSchema<T>,
    entityService: BaseDataSourceContext["entityService"],
  ): Promise<T> {
    const newsletter = await entityService.getEntity(
      {
        entityType: this.config.entityType,
        id: id,
      },
      newsletterSchema,
    );

    if (!newsletter) {
      throw new Error(`Newsletter not found: ${id}`);
    }

    // Use base class utility for prev/next navigation
    const navigation = await this.resolveNavigation(newsletter, entityService);

    // Resolve source entities if present
    let sourceEntities: Array<{ id: string; title: string; url: string }> = [];
    if (newsletter.metadata.entityIds?.length) {
      const entityType = newsletter.metadata.sourceEntityType ?? "post";
      const resolvedEntities = await Promise.all(
        newsletter.metadata.entityIds.map(async (entityId) => {
          const entity = await entityService.getEntity({
            entityType: entityType,
            id: entityId,
          });
          if (entity) {
            return {
              id: entityId,
              title: readString(entity.metadata, "title") ?? entityId,
              url: `/${entityType}s/${readString(entity.metadata, "slug") ?? entityId}`,
            };
          }
          return null;
        }),
      );
      sourceEntities = resolvedEntities.filter(
        (e): e is { id: string; title: string; url: string } => e !== null,
      );
    }

    const body = getNewsletterBody(newsletter);

    const detailData = {
      id: newsletter.id,
      subject: newsletter.metadata.subject,
      status: newsletter.metadata.status,
      content: body,
      created: newsletter.created,
      updated: newsletter.updated,
      ...(newsletter.metadata.sentAt !== undefined && {
        sentAt: newsletter.metadata.sentAt,
      }),
      ...(newsletter.metadata.scheduledFor !== undefined && {
        scheduledFor: newsletter.metadata.scheduledFor,
      }),
      newsletter,
      prevNewsletter: navigation.prev
        ? {
            id: navigation.prev.id,
            subject: navigation.prev.subject,
            url: navigation.prev.url,
          }
        : null,
      nextNewsletter: navigation.next
        ? {
            id: navigation.next.id,
            subject: navigation.next.subject,
            url: navigation.next.url,
          }
        : null,
      ...(sourceEntities.length > 0 && { sourceEntities }),
    };

    return outputSchema.parse(detailData);
  }
}
