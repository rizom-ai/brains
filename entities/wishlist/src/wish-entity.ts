import {
  defineEntity,
  defineEntityDashboardWidget,
  generateMarkdownWithFrontmatter,
  parseMarkdown,
  type EntityCreateContext,
  type EntityCreateRoute,
  type EntityDefinition,
} from "@brains/sdk/entities";
import { slugify } from "@brains/utils/string-utils";
import {
  wishFrontmatterSchema,
  wishMetadataSchema,
  wishSchema,
} from "./schemas/wish";
import { findExistingWish, SAME_WISH_DISTANCE } from "./lib/wish-dedup";
import { sortWishesByDemand } from "./lib/sort-wishes";
import { topWishesWidget } from "./widgets/top-wishes";
import { WISHLIST_INSTRUCTIONS } from "./instructions";

/**
 * Decide what a create request means for the wishlist.
 *
 * Deduplicated against what already exists: asking twice raises the count
 * rather than starting a second record. Returns what should be written and
 * lets the runtime write it, so "created" and "updated" describe what
 * actually happened.
 */
async function resolveWish(
  { input, entities, ai }: EntityCreateContext,
  maxDistance: number,
): ReturnType<Extract<EntityCreateRoute, { resolve: unknown }>["resolve"]> {
  if (input.visibility !== undefined && input.visibility !== "public") {
    return {
      refuse:
        "Wish creation currently supports public visibility only; use a note for shared or restricted capture.",
    };
  }

  const title = input.title ?? input.prompt ?? "Untitled wish";
  const description = input.content ?? input.prompt ?? "";
  const frontmatter = {
    title,
    status: "new" as const,
    priority: "medium" as const,
    requested: 1,
  };
  const content = generateMarkdownWithFrontmatter(description, frontmatter);
  const existing = await findExistingWish(
    {
      nearest: ({ query, ...options }) =>
        entities.nearest(wish, query, options),
      getEntity: (request) =>
        entities.getEntity(
          { ...request, visibilityScope: "public" },
          wishSchema,
        ),
      maxDistance,
      ai,
    },
    { title, content },
  );

  if (existing) {
    const parsed = wishFrontmatterSchema.parse(
      parseMarkdown(existing.content).frontmatter,
    );
    const requested = parsed.requested + 1;
    return {
      update: {
        id: existing.id,
        content: generateMarkdownWithFrontmatter(
          parseMarkdown(existing.content).content,
          { ...parsed, requested },
        ),
        metadata: { ...existing.metadata, requested },
      },
    };
  }

  return {
    create: {
      id: slugify(title),
      content,
      metadata: { ...frontmatter, slug: slugify(title) },
    },
  };
}

export function wishCreateRoutes(
  maxDistance: number = SAME_WISH_DISTANCE,
): NonNullable<EntityDefinition<"wish", typeof wishMetadataSchema>["create"]> {
  const resolve: Extract<EntityCreateRoute, { resolve: unknown }>["resolve"] = (
    context,
  ) => resolveWish(context, maxDistance);
  return {
    fromPrompt: { resolve },
    fromContent: { resolve },
    fromUpload: { resolve },
  };
}

/**
 * A capability the brain was asked for and could not perform.
 *
 * Excluded from projection sourcing: a wish records unmet demand, which is
 * not knowledge to derive topics from.
 */
export const wish: EntityDefinition<"wish", typeof wishMetadataSchema> =
  defineEntity({
    type: "wish",
    purpose:
      "A demand record the assistant proactively creates when a user requests a capability or outcome no installed tool can fulfill, unless the user declines.",
    metadata: wishMetadataSchema,
    config: { projectionSource: false, projectionSourceRole: "excluded" },
    markdown: {
      decode: ({ content, frontmatter }) => {
        const parsed = wishFrontmatterSchema.parse(frontmatter);
        return {
          // Wish consumers read the complete demand record, including fields
          // outside the metadata index, rather than a body-only document.
          content: generateMarkdownWithFrontmatter(content, { ...frontmatter }),
          metadata: {
            title: parsed.title,
            status: parsed.status,
            priority: parsed.priority,
            requested: parsed.requested,
            slug: slugify(parsed.title),
          },
        };
      },
      encode: ({ content, metadata }) => ({
        content,
        frontmatter: {
          title: metadata.title,
          status: metadata.status,
          priority: metadata.priority,
          requested: metadata.requested,
        },
      }),
    },
    // Whatever shape the caller used, a wish is the same record — the old
    // interceptor caught every shape, so each route names the same resolver.
    create: wishCreateRoutes(),
    dashboardWidgets: [
      defineEntityDashboardWidget(topWishesWidget, async ({ entities }) => {
        const wishes = await entities.listEntities(
          {
            entityType: "wish",
            options: { limit: 10 },
          },
          wishSchema,
        );
        sortWishesByDemand(wishes);
        return {
          items: wishes.map((entry) => ({
            id: entry.id,
            name: entry.metadata.title,
            count: entry.metadata.requested,
            priority: entry.metadata.priority,
            status: entry.metadata.status,
          })),
        };
      }),
    ],
    instructions: WISHLIST_INSTRUCTIONS,
  });
