import type { Tool } from "@brains/mcp-service";
import { createTool } from "@brains/mcp-service";
import { resolveEntityOrError } from "@brains/entity-service";
import type { SystemServices } from "./types";
import { getInputSchema, listInputSchema, searchInputSchema } from "./schemas";
import { sanitizeEntity } from "./tool-helpers";

export function createEntityReadTools(services: SystemServices): Tool[] {
  const { entityService, logger } = services;

  return [
    createTool(
      "system",
      "search",
      "Search entities using semantic search. Optionally filter by entity type.",
      searchInputSchema,
      async (input) => ({
        success: true,
        data: {
          results: (
            await entityService.search(input.query, {
              limit: input.limit ?? services.searchLimit,
              ...(input.entityType && { types: [input.entityType] }),
            })
          ).map((r) => ({ ...r, entity: sanitizeEntity(r.entity) })),
        },
      }),
      {
        visibility: "public",
        cli: {
          name: "search",
        },
      },
    ),

    createTool(
      "system",
      "get",
      "Retrieve a specific entity by type and identifier (ID, slug, or title).",
      getInputSchema,
      async (input) => {
        if (!entityService.getEntityTypes().includes(input.entityType)) {
          return {
            success: false,
            error: `Unknown entity type: ${input.entityType}. Available: ${entityService.getEntityTypes().join(", ")}`,
          };
        }
        const result = await resolveEntityOrError(
          entityService,
          input.entityType,
          input.id,
          logger,
        );
        return result.ok
          ? { success: true, data: { entity: sanitizeEntity(result.entity) } }
          : { success: false, error: result.error };
      },
      {
        visibility: "public",
        cli: {
          name: "get",
        },
      },
    ),

    createTool(
      "system",
      "list",
      "List entities by type. Returns metadata only — use system_get for full content.",
      listInputSchema,
      async (input) => {
        if (!entityService.getEntityTypes().includes(input.entityType)) {
          return {
            success: false,
            error: `Unknown entity type: ${input.entityType}. Available: ${entityService.getEntityTypes().join(", ")}`,
          };
        }
        const options: { limit: number; filter?: Record<string, unknown> } = {
          limit: input.limit ?? 20,
        };
        if (input.status)
          options.filter = { metadata: { status: input.status } };
        const entities = await entityService.listEntities({
          entityType: input.entityType,
          options: options,
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
        cli: {
          name: "list",
        },
      },
    ),
  ];
}
