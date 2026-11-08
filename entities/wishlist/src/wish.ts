import {
  defineEntity,
  type EntityDashboardBindingContext,
  type EntityDashboardWidget,
  type EntityDefinition,
} from "@brains/sdk/entities";
import { slugify } from "@brains/utils/string-utils";
import { WISHLIST_INSTRUCTIONS } from "./instructions";
import { sortWishesByDemand } from "./lib/sort-wishes";
import { wishFrontmatterSchema, wishMetadataSchema } from "./schemas/wish";
import { topWishesWidget } from "./widgets/top-wishes";

/** The most requested wishes the viewer may see, read at their visibility. */
function topWishes(
  context: EntityDashboardBindingContext,
): EntityDashboardWidget {
  return topWishesWidget.bind(context, async ({ entities, signal }) => {
    signal.throwIfAborted();
    const wishes = sortWishesByDemand(await entities.list(wish, { limit: 10 }));
    return {
      items: wishes.map((entry) => ({
        id: entry.id,
        name: entry.metadata.title,
        count: entry.metadata.requested,
        priority: entry.metadata.priority,
        status: entry.metadata.status,
      })),
    };
  });
}

/**
 * A wish: a demand record for a capability or outcome the brain was asked
 * for and no installed tool could fulfill. Its frontmatter is its metadata,
 * with the slug derived from the title; the body describes what was asked.
 * It records unmet demand, not knowledge, so it is no projection source.
 * Creating one goes through the package's configured create routes.
 */
export const wish: EntityDefinition<"wish", typeof wishMetadataSchema> =
  defineEntity({
    type: "wish",
    purpose:
      "A demand record the assistant proactively creates when a user requests a capability or outcome no installed tool can fulfill, unless the user declines.",
    metadata: wishMetadataSchema,
    markdown: {
      decode: ({ content, frontmatter }) => {
        const parsed = wishFrontmatterSchema.parse(frontmatter);
        return {
          content,
          metadata: {
            title: parsed.title,
            status: parsed.status,
            priority: parsed.priority,
            requested: parsed.requested,
            slug: slugify(parsed.title),
            ...(parsed.declinedReason !== undefined && {
              declinedReason: parsed.declinedReason,
            }),
          },
        };
      },
      // The slug is derived from the title, so it is not written back.
      encode: ({ content, metadata }) => ({
        content,
        frontmatter: {
          title: metadata.title,
          status: metadata.status,
          priority: metadata.priority,
          requested: metadata.requested,
          ...(metadata.declinedReason !== undefined && {
            declinedReason: metadata.declinedReason,
          }),
        },
      }),
    },
    config: { projectionSource: false, projectionSourceRole: "excluded" },
    instructions: WISHLIST_INSTRUCTIONS,
    dashboardWidgets: (context) => [topWishes(context)],
  });
