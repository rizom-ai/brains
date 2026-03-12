import {
  BaseEntityDataSource,
  type BaseQuery,
  type NavigationResult,
  type PaginationInfo,
} from "@brains/plugins";
import type { BaseDataSourceContext, IEntityService } from "@brains/plugins";
import { parseMarkdownWithFrontmatter } from "@brains/plugins";
import type { Logger, z } from "@brains/utils";
import {
  type Newsletter,
  newsletterFrontmatterSchema,
} from "../schemas/newsletter";

interface NewsletterQuery extends BaseQuery {
  status?: "draft" | "queued" | "published" | "failed";
}

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
 * Generate excerpt from content.
 * Takes first ~150 characters, truncating at word boundary.
 */
function generateExcerpt(content: string, maxLength = 150): string {
  if (content.length <= maxLength) return content;
  const truncated = content.slice(0, maxLength);
  const lastSpace = truncated.lastIndexOf(" ");
  if (lastSpace > maxLength * 0.7) {
    return truncated.slice(0, lastSpace) + "...";
  }
  return truncated + "...";
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

  protected transformEntity(entity: Newsletter): NewsletterListItem {
    const body = getNewsletterBody(entity);
    const item: NewsletterListItem = {
      id: entity.id,
      subject: entity.metadata.subject,
      status: entity.metadata.status,
      excerpt: generateExcerpt(body),
      created: entity.created,
      url: `/newsletters/${entity.id}`,
    };
    if (entity.metadata.sentAt) {
      item.sentAt = entity.metadata.sentAt;
    }
    return item;
  }

  protected buildDetailResult(
    _item: NewsletterListItem,
    _navigation: NavigationResult<NewsletterListItem> | null,
  ) {
    // Detail view is handled by the override below — this won't be called
    return {};
  }

  protected buildListResult(
    items: NewsletterListItem[],
    pagination: PaginationInfo | null,
    _query: BaseQuery,
  ) {
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
    const params = query as {
      entityType?: string;
      query?: NewsletterQuery;
    };

    const entityService = context.entityService;

    // Detail view — custom because it resolves source entities
    if (params.query?.id) {
      return this.fetchSingleNewsletter(
        params.query.id,
        outputSchema,
        entityService,
      );
    }

    // List view — use base fetchList with optional status filter
    const statusFilter = params.query?.status;
    const filterOpts = statusFilter
      ? { filter: { metadata: { status: statusFilter } } }
      : undefined;

    const baseQuery: BaseQuery = params.query ?? {};
    const { items, pagination } = await this.fetchList(
      baseQuery,
      entityService,
      filterOpts,
    );

    return outputSchema.parse(
      this.buildListResult(items, pagination, baseQuery),
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
      "newsletter",
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
