import type { Tool } from "@brains/mcp-service";
import { createTool } from "@brains/mcp-service";
import {
  permissionToVisibilityScope,
  resolveEntityOrError,
} from "@brains/entity-service";
import type { SystemServices } from "./types";
import { getInputSchema, listInputSchema, searchInputSchema } from "./schemas";
import { sanitizeEntity } from "./tool-helpers";
import { assertGuestReader } from "./guest-read-context";

const DEFAULT_SYSTEM_SEARCH_MIN_SCORE = 0.5;

/** A public reader is a site's visitor, and a draft is not theirs to read. */
const publishedOnlyFor = (
  visibilityScope: ReturnType<typeof permissionToVisibilityScope>,
): { publishedOnly?: true } =>
  visibilityScope === "public" ? { publishedOnly: true } : {};

interface BelowThreshold {
  minScore: number;
  weakerMatches: number;
  bestScore: number;
  hint: string;
}

/**
 * An empty result above `minScore` is not evidence that nothing exists: broad
 * or abstract questions match content only weakly. When weaker candidates
 * exist, say so, so the model searches again instead of concluding absence.
 */
function describeWeakerMatches(
  candidates: readonly { score: number }[],
  minScore: number,
): BelowThreshold | undefined {
  if (candidates.length === 0) return undefined;
  const bestScore =
    Math.round(Math.max(...candidates.map((result) => result.score)) * 100) /
    100;
  return {
    minScore,
    weakerMatches: candidates.length,
    bestScore,
    hint: `No result reached minScore ${minScore}, but ${candidates.length} weaker match${candidates.length === 1 ? "" : "es"} exist (best score ${bestScore}). Broad or abstract questions match content weakly: search again with a lower minScore, such as 0.3, before concluding that nothing relevant exists.`,
  };
}

export function createEntityReadTools(services: SystemServices): Tool[] {
  const { entityService, logger } = services;

  return [
    createTool(
      "system",
      "search",
      "Search entities using semantic search. For broad search, make one system_search call with scope.kind all. Use scope.kind type only when the user asks for a specific entity type. Applies a default minScore of 0.5 to reduce weak matches; lower minScore only for exploratory or loose recall. An empty result with belowThreshold means weaker matches exist: search again with a lower minScore before concluding that nothing relevant exists. Search results include each matched entity's content. When relevant results already contain the complete evidence needed, answer from those results instead of redundantly listing or getting the same entities. Search results are candidates; do not present weak or unrelated candidates as exact matches.",
      searchInputSchema,
      async (input, context) => {
        assertGuestReader(context);
        const visibilityScope = permissionToVisibilityScope(
          context.userPermissionLevel,
        );
        const minScore = input.minScore ?? DEFAULT_SYSTEM_SEARCH_MIN_SCORE;
        // Ranked by score before the limit applies, so filtering the top
        // candidates by minScore equals a thresholded search, and the
        // candidates below it cost no second query.
        const candidates = await entityService.search({
          query: input.query,
          options: {
            limit: input.limit ?? services.searchLimit,
            ...(input.scope.kind === "type" && {
              types: [input.scope.entityType],
            }),
            ...(input.includeUngenerated !== undefined && {
              includeUngenerated: input.includeUngenerated,
            }),
            visibilityScope,
            ...publishedOnlyFor(visibilityScope),
          },
        });
        const results = candidates.filter(
          (candidate) => candidate.score >= minScore,
        );
        const belowThreshold =
          results.length === 0
            ? describeWeakerMatches(candidates, minScore)
            : undefined;
        return {
          success: true,
          data: {
            results: results.map((r) => {
              const entity = sanitizeEntity(r.entity, services.entityRegistry);
              return {
                ...r,
                entity,
                ...(entity !== r.entity ? { excerpt: entity.content } : {}),
              };
            }),
            ...(belowThreshold && { belowThreshold }),
          },
        };
      },
      {
        visibility: "public",
        sideEffects: "none",
        cli: {
          name: "search",
        },
      },
    ),

    createTool(
      "system",
      "get",
      "Retrieve a specific entity by type and identifier (ID, slug, or title). If retrieval fails, report the entity as not found rather than describing related generation work as pending.",
      getInputSchema,
      async (input, context) => {
        assertGuestReader(context);
        if (!entityService.getEntityTypes().includes(input.entityType)) {
          return {
            success: false,
            error: `Unknown entity type: ${input.entityType}. Available: ${entityService.getEntityTypes().join(", ")}`,
          };
        }
        const visibilityScope = permissionToVisibilityScope(
          context.userPermissionLevel,
        );
        const result = await resolveEntityOrError(
          entityService,
          input.entityType,
          input.id,
          logger,
          undefined,
          visibilityScope,
          publishedOnlyFor(visibilityScope),
        );
        if (!result.ok) {
          return { success: false, error: result.error };
        }
        return {
          success: true,
          data: {
            entity: sanitizeEntity(result.entity, services.entityRegistry),
          },
        };
      },
      {
        visibility: "public",
        sideEffects: "none",
        cli: {
          name: "get",
        },
      },
    ),

    createTool(
      "system",
      "list",
      "List entities by a known entity type. Returns metadata only — use system_get for full content. Use system_search, not system_list, for broad or vague lookup requests. Use system_list to inspect metadata dates such as publishedAt when the user asks for the latest item of a known type, such as latest blog post.",
      listInputSchema,
      async (input, context) => {
        assertGuestReader(context);
        if (!entityService.getEntityTypes().includes(input.entityType)) {
          return {
            success: false,
            error: `Unknown entity type: ${input.entityType}. Available: ${entityService.getEntityTypes().join(", ")}`,
          };
        }
        const visibilityScope = permissionToVisibilityScope(
          context.userPermissionLevel,
        );
        const filter: {
          metadata?: Record<string, unknown>;
          visibilityScope: typeof visibilityScope;
        } = {
          visibilityScope,
        };
        if (input.status && input.status !== "any") {
          filter.metadata = { status: input.status };
        }
        const { defaultSort } = services.entityRegistry.getEntityTypeConfig(
          input.entityType,
        );
        const entities = await entityService.listEntities({
          entityType: input.entityType,
          options: {
            limit: input.limit ?? 20,
            filter,
            ...publishedOnlyFor(visibilityScope),
            ...(defaultSort ? { sortFields: defaultSort } : {}),
          },
        });
        const items = entities.map(
          ({ content: _, contentHash: __, ...rest }) => rest,
        );
        return {
          success: true,
          data: { entities: items, count: items.length },
        };
      },
      {
        visibility: "public",
        sideEffects: "none",
        cli: {
          name: "list",
        },
      },
    ),
  ];
}
