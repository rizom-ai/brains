import { defineEntityDataSource } from "@brains/sdk/entities";
import type {
  AnyEntityDataSourceDefinition,
  BaseEntity,
} from "@brains/sdk/entities";
import { parseLinkContent } from "../lib/link-content";
import type { LinkSummary } from "../templates/link-list/schema";

function toSummary(entity: BaseEntity): LinkSummary {
  const { frontmatter, summary } = parseLinkContent(entity.content);
  return {
    id: entity.id,
    ...frontmatter,
    description: frontmatter.description ?? null,
    summary,
  };
}

/**
 * Links list and detail, with prev/next navigation.
 *
 * The id is local: the runtime scopes it to the package, and templates
 * naming it are rewritten to match.
 */
export const linksDataSource: AnyEntityDataSourceDefinition =
  defineEntityDataSource({
    id: "entities",
    name: "Links Entity DataSource",
    description: "Fetches and transforms link entities for rendering",
    entityType: "link",
    defaultSort: [{ field: "capturedAt", direction: "desc" }],
    defaultLimit: 1000,
    lookupField: "id",
    enableNavigation: true,
    navigationLimit: 1000,
    transform: toSummary,
    list: (items: LinkSummary[]) => ({
      links: items,
      totalCount: items.length,
    }),
    detail: ({ item, siblings }) => {
      const links = [...siblings];
      const index = links.findIndex((entry) => entry.id === item.id);
      return {
        link: item,
        prevLink: index > 0 ? (links[index - 1] ?? null) : null,
        nextLink:
          index >= 0 && index < links.length - 1
            ? (links[index + 1] ?? null)
            : null,
      };
    },
  });
