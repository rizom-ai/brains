import {
  defineEntityDataSource,
  parseMarkdownWithFrontmatter,
  truncateText,
  type EntityDataSourceDefinition,
  type EntityQueryReader,
} from "@brains/sdk/entities";
import { readString } from "@brains/utils/record-fields";
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

/** The body without its header; the file keeps both. */
function newsletterBody(newsletter: Newsletter): string {
  try {
    return parseMarkdownWithFrontmatter(
      newsletter.content,
      newsletterFrontmatterSchema,
    ).content;
  } catch {
    return newsletter.content;
  }
}

/**
 * What one issue becomes for rendering: the list item, plus what only the
 * detail view reads. The list hands out the item; the detail view has the
 * rest without reading the entity again.
 */
export interface TransformedNewsletter {
  readonly item: NewsletterListItem;
  readonly body: string;
  readonly updated: string;
  readonly scheduledFor: string | null;
  readonly entityIds: readonly string[];
  readonly sourceEntityType: string;
}

interface SourceEntityLink {
  readonly id: string;
  readonly title: string;
  readonly url: string;
}

/** The posts (or other sources) an issue was written from, those that still exist. */
async function resolveSourceEntities(
  newsletter: TransformedNewsletter,
  entities: EntityQueryReader,
): Promise<SourceEntityLink[]> {
  const found = await Promise.all(
    newsletter.entityIds.map(async (id) => {
      const entity = await entities.getEntity({
        entityType: newsletter.sourceEntityType,
        id,
      });
      if (!entity) return null;
      return {
        id,
        title: readString(entity.metadata, "title") ?? id,
        url: `/${newsletter.sourceEntityType}s/${readString(entity.metadata, "slug") ?? id}`,
      };
    }),
  );
  return found.filter((link): link is SourceEntityLink => link !== null);
}

const navigationLink = (
  neighbour: TransformedNewsletter | null | undefined,
): { id: string; subject: string; url: string } | null =>
  neighbour
    ? {
        id: neighbour.item.id,
        subject: neighbour.item.subject,
        url: neighbour.item.url,
      }
    : null;

/**
 * Issues as a list, and one issue with its neighbours and the posts it was
 * written from. Newest first, by creation, since a draft has no send date.
 */
export const newsletterDataSource: EntityDataSourceDefinition<
  Newsletter,
  TransformedNewsletter,
  NewsletterListData
> = defineEntityDataSource({
  id: "entities",
  name: "Newsletter Entity DataSource",
  description: "Fetches and transforms newsletter entities for rendering",
  entityType: "newsletter",
  entitySchema: newsletterSchema,
  defaultSort: [{ field: "created", direction: "desc" }],
  defaultLimit: 10,
  lookupField: "id",
  enableNavigation: true,
  // A status in the query narrows the database read, so a filtered list
  // pages over the filtered set rather than over everything.
  filter: (query) => {
    const status = newsletterStatusSchema.optional().parse(query["status"]);
    return status ? { filter: { metadata: { status } } } : undefined;
  },
  transform: (entity: Newsletter): TransformedNewsletter => {
    const body = newsletterBody(entity);
    return {
      item: {
        id: entity.id,
        subject: entity.metadata.subject,
        status: entity.metadata.status,
        excerpt: truncateText(body, 150),
        created: entity.created,
        sentAt: entity.metadata.sentAt ?? null,
        url: `/newsletters/${entity.id}`,
      },
      body,
      updated: entity.updated,
      scheduledFor: entity.metadata.scheduledFor ?? null,
      entityIds: entity.metadata.entityIds ?? [],
      sourceEntityType: entity.metadata.sourceEntityType ?? "post",
    };
  },
  list: (items, pagination) => ({
    newsletters: items.map(({ item }) => item),
    totalCount: pagination?.totalItems ?? items.length,
    pagination,
  }),
  detail: async ({ item, navigation, entities }) => {
    const sourceEntities = await resolveSourceEntities(item, entities);
    return {
      id: item.item.id,
      subject: item.item.subject,
      status: item.item.status,
      content: item.body,
      created: item.item.created,
      updated: item.updated,
      sentAt: item.item.sentAt,
      scheduledFor: item.scheduledFor,
      prevNewsletter: navigationLink(navigation?.prev),
      nextNewsletter: navigationLink(navigation?.next),
      sourceEntities: sourceEntities.length > 0 ? sourceEntities : null,
    };
  },
});
