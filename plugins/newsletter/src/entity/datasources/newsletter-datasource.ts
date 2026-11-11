import {
  defineDataSource,
  type EntityDataSourceDefinition,
  type EntityDefinition,
} from "@brains/sdk/entities";
import {
  entityRuntime,
  type AnyEntityReads,
} from "@brains/sdk/internal/entity-runtime";
import { parseMarkdownWithFrontmatter } from "@brains/plugins";
import { readString } from "@brains/utils/record-fields";
import { truncateText } from "@brains/utils/string-utils";
import { z } from "@brains/utils/zod";
import {
  newsletterFrontmatterSchema,
  newsletterStatusSchema,
  type Newsletter,
  type newsletterMetadataSchema,
} from "../schemas/newsletter";
import type {
  NewsletterListData,
  NewsletterListItem,
} from "../templates/newsletter-list";

type NewsletterDefinition = EntityDefinition<
  "newsletter",
  typeof newsletterMetadataSchema
>;

/**
 * The issue's body. A declared issue reads back as its body already; a
 * stored document's frontmatter is stripped, as the class's source did.
 */
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
 * detail view reads.
 */
export interface TransformedNewsletter {
  readonly item: NewsletterListItem;
  readonly body: string;
  readonly updated: string;
  readonly scheduledFor: string | undefined;
  readonly sentAt: string | undefined;
  readonly entityIds: readonly string[];
  readonly sourceEntityType: string;
}

interface SourceEntityLink {
  readonly id: string;
  readonly title: string;
  readonly url: string;
}

/**
 * The posts an issue was written from, those that still exist, read by the
 * type the issue names at the build's scope, as the class read them.
 */
async function resolveSourceEntities(
  newsletter: TransformedNewsletter,
  entities: Pick<AnyEntityReads, "getEntity">,
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

/** The status a list query may narrow by. */
const listFilterSchema = z.looseObject({
  status: newsletterStatusSchema.optional(),
});

/**
 * Issues as a list, newest first by creation, narrowed by status when
 * asked; and one issue by its id, with its neighbours and the posts it was
 * written from.
 */
export function newsletterDataSource(
  newsletter: NewsletterDefinition,
): EntityDataSourceDefinition<
  NewsletterDefinition,
  TransformedNewsletter,
  NewsletterListData
> {
  return defineDataSource({
    id: "entities",
    name: "Newsletter Entity DataSource",
    description: "Fetches and transforms newsletter entities for rendering",
    entity: newsletter,
    defaultSort: [{ field: "created", direction: "desc" }],
    defaultLimit: 10,
    lookupField: "id",
    enableNavigation: true,
    filter: (query) => {
      const { status } = listFilterSchema.parse(query);
      return status ? { metadata: { status } } : undefined;
    },
    transform: (entity): TransformedNewsletter => {
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
        scheduledFor: entity.metadata.scheduledFor,
        sentAt: entity.metadata.sentAt,
        entityIds: entity.metadata.entityIds ?? [],
        sourceEntityType: entity.metadata.sourceEntityType ?? "post",
      };
    },
    list: (items, pagination) => ({
      newsletters: items.map(({ item }) => item),
      totalCount: pagination?.totalItems ?? items.length,
      pagination,
    }),
    detail: async (context) => {
      const { item, navigation } = context;
      const sourceEntities = await resolveSourceEntities(
        item,
        entityRuntime(context).anyEntities,
      );
      return {
        id: item.item.id,
        subject: item.item.subject,
        status: item.item.status,
        content: item.body,
        created: item.item.created,
        updated: item.updated,
        ...(item.sentAt !== undefined && { sentAt: item.sentAt }),
        ...(item.scheduledFor !== undefined && {
          scheduledFor: item.scheduledFor,
        }),
        prevNewsletter: navigationLink(navigation?.prev),
        nextNewsletter: navigationLink(navigation?.next),
        ...(sourceEntities.length > 0 && { sourceEntities }),
      };
    },
  });
}
