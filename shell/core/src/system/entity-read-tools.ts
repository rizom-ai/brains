import type { Tool } from "@brains/mcp-service";
import { createTool } from "@brains/mcp-service";
import {
  permissionToVisibilityScope,
  resolveEntityOrError,
} from "@brains/entity-service";
import type { SystemServices } from "./types";
import { getInputSchema, listInputSchema, searchInputSchema } from "./schemas";
import { sanitizeEntity } from "./tool-helpers";

const DEFAULT_SYSTEM_SEARCH_MIN_SCORE = 0.5;

export function createEntityReadTools(services: SystemServices): Tool[] {
  const { entityService, logger } = services;

  return [
    createTool(
      "system",
      "search",
      "Search entities using semantic search. For broad search, make one system_search call with scope.kind all. Use scope.kind type only when the user asks for a specific entity type. Applies a default minScore of 0.5 to reduce weak matches; lower minScore only for exploratory or loose recall. Search results are candidates; do not present weak or unrelated candidates as exact matches.",
      searchInputSchema,
      async (input, context) => {
        const visibilityScope = permissionToVisibilityScope(
          context.userPermissionLevel,
        );
        return {
          success: true,
          data: {
            results: (
              await entityService.search({
                query: input.query,
                options: {
                  limit: input.limit ?? services.searchLimit,
                  ...(input.scope.kind === "type" && {
                    types: [input.scope.entityType],
                  }),
                  minScore: input.minScore ?? DEFAULT_SYSTEM_SEARCH_MIN_SCORE,
                  ...(input.includeUngenerated !== undefined && {
                    includeUngenerated: input.includeUngenerated,
                  }),
                  visibilityScope,
                },
              })
            ).map((r) => ({ ...r, entity: sanitizeEntity(r.entity) })),
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
        );
        if (!result.ok) {
          return { success: false, error: result.error };
        }
        return {
          success: true,
          data: { entity: sanitizeEntity(result.entity) },
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
        const entities = await entityService.listEntities({
          entityType: input.entityType,
          options: { limit: input.limit ?? 20, filter },
        });
        const items = entities.map(
          ({ content: _, contentHash: __, ...rest }) => rest,
        );
        if (input.entityType === "post" && input.status === "published") {
          items.sort((left, right) => {
            const leftDate = left.metadata["publishedAt"];
            const rightDate = right.metadata["publishedAt"];
            const leftTime =
              typeof leftDate === "string" ? Date.parse(leftDate) : 0;
            const rightTime =
              typeof rightDate === "string" ? Date.parse(rightDate) : 0;
            return rightTime - leftTime;
          });
        }
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
