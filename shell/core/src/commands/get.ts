import type {
  Command,
  CommandContext,
  CommandResponse,
} from "@brains/command-registry";
import type { Shell } from "../shell";
import type { EntityService } from "@brains/entity-service";
import type { BaseEntity } from "@brains/types";

export function createGetCommand(shell: Shell): Command {
  return {
    name: "get",
    description: "Get a specific entity by ID",
    usage: "/get <entity-id> [entity-type]",
    handler: async (
      args: string[],
      _context: CommandContext,
    ): Promise<CommandResponse> => {
      if (args.length === 0) {
        return {
          type: "message",
          message:
            "Please provide an entity ID. Usage: /get <entity-id> [entity-type]",
        };
      }

      const entityId = args[0] as string; // We know it exists because we checked args.length > 0
      const entityType = args[1] ?? "base";
      const entityService = shell
        .getServiceRegistry()
        .resolve("entityService") as EntityService;

      try {
        const entity = await entityService.getEntity<BaseEntity>(
          entityType,
          entityId,
        );

        if (!entity) {
          return {
            type: "message",
            message: `Entity not found: ${entityId} (type: ${entityType})`,
          };
        }

        // Format entity as a readable string
        const formatted = [
          `ID: ${entity.id}`,
          `Type: ${entity.entityType}`,
          `Title: ${entity.metadata?.["title"] ?? "Untitled"}`,
          `Created: ${new Date(entity.created).toLocaleString()}`,
          `Updated: ${new Date(entity.updated).toLocaleString()}`,
          ``,
          `Content:`,
          entity.content,
        ].join("\n");

        return {
          type: "message",
          message: formatted,
        };
      } catch (error) {
        return {
          type: "message",
          message: `Error getting entity: ${error instanceof Error ? error.message : String(error)}`,
        };
      }
    },
  };
}
