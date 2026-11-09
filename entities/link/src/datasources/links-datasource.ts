import {
  defineDataSource,
  type EntityDataSourceDefinition,
  type EntityDefinition,
  type EntityOf,
} from "@brains/sdk/entities";
import { linkSummary } from "../lib/link-markdown";
import type { linkMetadataSchema } from "../schemas/link";
import type { LinkListData, LinkSummary } from "../templates/link-list/schema";

type LinkDefinition = EntityDefinition<"link", typeof linkMetadataSchema>;

/** A link as the site reads it: its fields, its domain and its summary. */
function linkData(entity: EntityOf<LinkDefinition>): LinkSummary {
  const { metadata } = entity;
  return {
    id: entity.id,
    status: metadata.status,
    title: metadata.title,
    url: metadata.url,
    capturedAt: metadata.capturedAt,
    source: metadata.source,
    domain: new URL(metadata.url).hostname,
    description: metadata.description ?? null,
    summary: linkSummary(entity.content),
  };
}

/**
 * Fetches and transforms links for rendering: every link, newest captured
 * first, or one link by its id with its neighbors.
 */
export function linksDataSource(
  link: LinkDefinition,
): EntityDataSourceDefinition<LinkDefinition, LinkSummary, LinkListData> {
  return defineDataSource({
    id: "entities",
    name: "Links Entity DataSource",
    description: "Fetches and transforms link entities for rendering",
    entity: link,
    defaultSort: [{ field: "capturedAt", direction: "desc" }],
    defaultLimit: 1000,
    lookupField: "id",
    enableNavigation: true,
    transform: linkData,
    list: (items) => ({ links: [...items], totalCount: items.length }),
    detail: ({ item, navigation }) => ({
      link: item,
      prevLink: navigation?.prev ?? null,
      nextLink: navigation?.next ?? null,
    }),
  });
}
