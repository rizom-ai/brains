import {
  BaseEntityDataSource,
  baseQuerySchema,
  baseInputSchema,
  type BaseQuery,
  type PaginationInfo,
} from "@brains/plugins";
import type { BaseDataSourceContext, IEntityService } from "@brains/plugins";
import { parseMarkdownWithFrontmatter } from "@brains/plugins";
import type { Logger } from "@brains/utils";
import { z, truncateText } from "@brains/utils";
import {
  type Newsletter,
  newsletterFrontmatterSchema,
} from "../schemas/newsletter";

const newsletterQuerySchema = baseQuerySchema.extend({
  status: z.enum(["draft", "queued", "published", "failed"]).optional(),
});

const newsletterInputSchema = baseInputSchema.extend({
  query: newsletterQuerySchema.optional(),
});

type NewsletterQuery = z.infer<typeof newsletterQuerySchema>;

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

interface NewsletterListData {
  newsletters: NewsletterListItem[];
  totalCount: number;
  pagination: PaginationInfo | null;
}

/** Enriched newsletter summary for list views. */
interface NewsletterListItem {
  id: string;
  subject: string;
  status: string;
  excerpt: string;
  created: string;
  sentAt?: string;
  url: string;
}

/**
 * DataSource for fetching and transforming newsletter entities.
 * Handles list views with pagination/status filtering and detail views
 * with prev/next navigation and source entity resolution.
 */
export class NewsletterDataSource extends BaseEntityDataSource<
  Newsletter,
  NewsletterListItem
> {
  readonly id = "newsletter:entities";
  readonly name = "Newsletter Entity DataSource";
  readonly description =
    "Fetches and transforms newsletter entities for rendering";

  protected readonly config = {
    entityType: "newsletter",
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
      url: `/newsletters/${entity.id}`,
    };
    if (entity.metadata.sentAt) {
      item.sentAt = entity.metadata.sentAt;
    }
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
    outputSchema: z.ZodSchema<T>,
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
    outputSchema: z.ZodSchema<T>,
    entityService: IEntityService,
  ): Promise<T> {
    const newsletter = await entityService.getEntity<Newsletter>(
      this.config.entityType,
      id,
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
          const entity = await entityService.getEntity(entityType, entityId);
          if (entity) {
            const metadata = entity.metadata as {
              title?: string;
              slug?: string;
            };
            return {
              id: entityId,
              title: metadata.title ?? entityId,
              url: `/${entityType}s/${metadata.slug ?? entityId}`,
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
      sentAt: newsletter.metadata.sentAt,
      scheduledFor: newsletter.metadata.scheduledFor,
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
      sourceEntities: sourceEntities.length > 0 ? sourceEntities : undefined,
    };

    return outputSchema.parse(detailData);
  }
}
