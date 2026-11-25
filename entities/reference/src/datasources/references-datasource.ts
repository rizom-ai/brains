import {
  defineDataSource,
  type EntityDataSourceDefinition,
  type EntityOf,
} from "@brains/sdk/entities";
import type { ReferenceDefinition } from "../reference";
import type {
  ReferenceListData,
  ReferenceListItem,
} from "../templates/reference-list";

function referenceItem(
  entity: EntityOf<ReferenceDefinition>,
): ReferenceListItem {
  const { metadata } = entity;
  return {
    id: entity.id,
    kind: metadata.sourceEntityType,
    title: metadata.title,
    summary: metadata.summary ?? null,
    author: metadata.author,
    authorSite: metadata.authorSite,
    url: metadata.url,
    publishedAt: metadata.publishedAt,
    series: metadata.series ?? null,
    status: metadata.status,
  };
}

/**
 * The selection a site shows: the references whose source is still
 * published by its author, newest first. A production build reads published
 * entries only, so a draft appears in a preview and nowhere else; a
 * withdrawn entry appears in neither.
 */
export function referencesDataSource(
  reference: ReferenceDefinition,
): EntityDataSourceDefinition<
  ReferenceDefinition,
  ReferenceListItem,
  ReferenceListData
> {
  return defineDataSource({
    id: "entities",
    name: "References DataSource",
    description:
      "The references whose source is active, newest first, for a site section",
    entity: reference,
    defaultSort: [{ field: "publishedAt", direction: "desc" }],
    defaultLimit: 1000,
    filter: () => ({ metadata: { sourceState: "active" as const } }),
    transform: referenceItem,
    list: (items) => ({ references: [...items] }),
  });
}
