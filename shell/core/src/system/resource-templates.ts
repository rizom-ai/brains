import { inlineAssetContent } from "@brains/entity-service";
import type { ResourceTemplate } from "@brains/mcp-service";
import type { ResourceVars } from "@brains/mcp-service";
import type { SystemServices } from "./types";

/**
 * System resource templates — parameterized MCP resources for entity access.
 *
 * These were previously registered via context.resources.registerTemplate()
 * in the system plugin. Now they're framework-level.
 */
export function createSystemResourceTemplates(
  services: SystemServices,
): ResourceTemplate[] {
  const { entityService } = services;

  return [
    {
      name: "entity-list",
      uriTemplate: "entity://{type}",
      description: "List entities of a given type",
      mimeType: "application/json",
      list: async (): Promise<Array<{ uri: string; name: string }>> => {
        const types = entityService.getEntityTypes();
        return types.map((t) => ({
          uri: `entity://${t}`,
          name: `${t} entities`,
        }));
      },
      complete: {
        type: async () => entityService.getEntityTypes(),
      },
      handler: async ({
        type,
      }: ResourceVars<"type">): Promise<{
        contents: Array<{ uri: string; mimeType: string; text: string }>;
      }> => {
        const availableTypes = entityService.getEntityTypes();
        if (!availableTypes.includes(type)) {
          throw new Error(
            `Unknown entity type: ${type}. Available: ${availableTypes.join(", ")}`,
          );
        }
        const entities = await entityService.listEntities({
          entityType: type,
          options: { binaryContent: "reference" },
        });
        const items = entities.map((e) => ({
          id: e.id,
          entityType: e.entityType,
          ...e.metadata,
          updated: e.updated,
        }));
        return {
          contents: [
            {
              uri: `entity://${type}`,
              mimeType: "application/json",
              text: JSON.stringify(items, null, 2),
            },
          ],
        };
      },
    },
    {
      name: "entity-detail",
      uriTemplate: "entity://{type}/{id}",
      description: "Read a single entity by type and ID",
      mimeType: "text/markdown",
      complete: {
        type: async (value: string): Promise<string[]> => {
          const types = entityService.getEntityTypes();
          return value ? types.filter((t) => t.startsWith(value)) : types;
        },
        id: async (): Promise<string[]> => [],
      },
      handler: async ({
        type,
        id,
      }: ResourceVars<"type" | "id">): Promise<{
        contents: Array<{ uri: string; mimeType: string; text: string }>;
      }> => {
        // As stored: an asset-backed record's bytes are read for this record
        // alone and handed out as the data URL this resource has served.
        const entity = await entityService.getEntity({
          entityType: type,
          id: id,
          binaryContent: "reference",
        });
        if (!entity) {
          throw new Error(`Entity not found: ${type}/${id}`);
        }
        const text =
          services.entityRegistry.getEntityTypeConfig(type).binaryStorage ===
          "asset"
            ? await inlineAssetContent(
                entityService,
                entity.content,
                entity.metadata,
              )
            : entity.content;
        return {
          contents: [
            {
              uri: `entity://${type}/${id}`,
              mimeType: "text/markdown",
              text,
            },
          ],
        };
      },
    },
  ];
}
