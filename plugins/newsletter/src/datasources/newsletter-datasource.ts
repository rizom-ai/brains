import type {
  DataSource,
  BaseDataSourceContext,
  IEntityService,
} from "@brains/plugins";
import type { Logger } from "@brains/utils";
import {
  buildPaginationInfo,
  parseMarkdownWithFrontmatter,
} from "@brains/plugins";
import { z } from "@brains/utils";
import {
  type Newsletter,
  newsletterFrontmatterSchema,
} from "../schemas/newsletter";

// Schema for fetch query parameters
const entityFetchQuerySchema = z.object({
  entityType: z.string(),
  query: z
    .object({
      id: z.string().optional(),
      status: z.enum(["draft", "queued", "published", "failed"]).optional(),
      limit: z.number().optional(),
      page: z.number().optional(),
      pageSize: z.number().optional(),
      baseUrl: z.string().optional(),
    })
    .optional(),
});

/**
 * Extract body content from newsletter (strips frontmatter)
 */
function getNewsletterBody(newsletter: Newsletter): string {
  try {
    const { content } = parseMarkdownWithFrontmatter(
      newsletter.content,
      newsletterFrontmatterSchema,
    );
    return content;
  } catch {
    // Content doesn't have frontmatter, return as-is
    return newsletter.content;
  }
}

/**
 * Generate excerpt from content
 * Takes first ~150 characters, truncating at word boundary
 */
function generateExcerpt(content: string, maxLength = 150): string {
  if (content.length <= maxLength) {
    return content;
  }
  const truncated = content.slice(0, maxLength);
  const lastSpace = truncated.lastIndexOf(" ");
  if (lastSpace > maxLength * 0.7) {
    return truncated.slice(0, lastSpace) + "...";
  }
  return truncated + "...";
}

/**
 * DataSource for fetching and transforming newsletter entities
 * Handles list views and detail views for newsletters
 */
export class NewsletterDataSource implements DataSource {
  public readonly id = "newsletter:entities";
  public readonly name = "Newsletter Entity DataSource";
  public readonly description =
    "Fetches and transforms newsletter entities for rendering";

  constructor(private readonly logger: Logger) {
    this.logger.debug("NewsletterDataSource initialized");
  }

  /**
   * Fetch and transform newsletter entities to template-ready format
   */
  async fetch<T>(
    query: unknown,
    outputSchema: z.ZodSchema<T>,
    context: BaseDataSourceContext,
  ): Promise<T> {
    const params = entityFetchQuerySchema.parse(query);
    // Use context.entityService for automatic publishedOnly filtering
    const entityService = context.entityService;

    // Case 1: Fetch single newsletter by ID
    if (params.query?.id) {
      return this.fetchSingleNewsletter(
        params.query.id,
        outputSchema,
        entityService,
      );
    }

    // Case 2: Fetch list of newsletters
    return this.fetchNewsletterList(
      params.query?.limit,
      params.query?.page,
      params.query?.pageSize,
      params.query?.status,
      params.query?.baseUrl,
      outputSchema,
      entityService,
    );
  }

  /**
   * Fetch a single newsletter by ID with navigation
   */
  private async fetchSingleNewsletter<T>(
    id: string,
    outputSchema: z.ZodSchema<T>,
    entityService: IEntityService,
  ): Promise<T> {
    // Fetch newsletter by ID
    const newsletter = await entityService.getEntity<Newsletter>(
      "newsletter",
      id,
    );

    if (!newsletter) {
      throw new Error(`Newsletter not found: ${id}`);
    }

    // Fetch all newsletters for navigation (sorted by created desc)
    const allNewsletters: Newsletter[] =
      await entityService.listEntities<Newsletter>("newsletter", {
        limit: 1000,
        sortFields: [{ field: "created", direction: "desc" }],
      });

    const currentIndex = allNewsletters.findIndex((n) => n.id === id);
    const prevNewsletter =
      currentIndex > 0 ? allNewsletters[currentIndex - 1] : null;
    const nextNewsletter =
      currentIndex < allNewsletters.length - 1
        ? allNewsletters[currentIndex + 1]
        : null;

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

    // Parse content to strip frontmatter
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
      newsletter, // Include full newsletter for template access
      prevNewsletter: prevNewsletter
        ? {
            id: prevNewsletter.id,
            subject: prevNewsletter.metadata.subject,
            url: `/newsletters/${prevNewsletter.id}`,
          }
        : null,
      nextNewsletter: nextNewsletter
        ? {
            id: nextNewsletter.id,
            subject: nextNewsletter.metadata.subject,
            url: `/newsletters/${nextNewsletter.id}`,
          }
        : null,
      sourceEntities: sourceEntities.length > 0 ? sourceEntities : undefined,
    };

    return outputSchema.parse(detailData);
  }

  /**
   * Fetch list of newsletters with optional pagination and filtering
   */
  private async fetchNewsletterList<T>(
    limit: number | undefined,
    page: number | undefined,
    pageSize: number | undefined,
    status: "draft" | "queued" | "published" | "failed" | undefined,
    _baseUrl: string | undefined,
    outputSchema: z.ZodSchema<T>,
    entityService: IEntityService,
  ): Promise<T> {
    const currentPage = page ?? 1;
    const itemsPerPage = pageSize ?? limit ?? 10;
    const offset = (currentPage - 1) * itemsPerPage;

    // Build query options
    const queryOptions: {
      limit: number;
      offset: number;
      sortFields: Array<{ field: string; direction: "asc" | "desc" }>;
      filter?: { metadata: { status: string } };
    } = {
      limit: itemsPerPage,
      offset,
      sortFields: [{ field: "created", direction: "desc" }],
    };

    if (status) {
      queryOptions.filter = { metadata: { status } };
    }

    const newsletters: Newsletter[] =
      await entityService.listEntities<Newsletter>("newsletter", queryOptions);

    // Get total count for pagination
    let pagination = null;
    if (page !== undefined) {
      const totalItems = await entityService.countEntities(
        "newsletter",
        status ? { filter: { metadata: { status } } } : undefined,
      );
      pagination = buildPaginationInfo(totalItems, currentPage, itemsPerPage);
    }

    // Enrich newsletters with excerpt (from body, not frontmatter) and URL
    const enrichedNewsletters = newsletters.map((newsletter) => {
      const body = getNewsletterBody(newsletter);
      return {
        id: newsletter.id,
        subject: newsletter.metadata.subject,
        status: newsletter.metadata.status,
        excerpt: generateExcerpt(body),
        created: newsletter.created,
        sentAt: newsletter.metadata.sentAt,
        url: `/newsletters/${newsletter.id}`,
      };
    });

    const listData = {
      newsletters: enrichedNewsletters,
      totalCount: pagination?.totalItems ?? newsletters.length,
      pagination,
    };

    return outputSchema.parse(listData);
  }
}
