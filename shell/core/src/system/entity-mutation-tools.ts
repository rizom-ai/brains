import type { Tool } from "@brains/mcp-service";
import { createEntityCoverTool } from "./entity-cover-tool";
import { createEntityCreateTool } from "./entity-create-tool";
import { createEntityDeleteTool } from "./entity-delete-tool";
import { createEntityExtractTool } from "./entity-extract-tool";
import { createEntityUpdateTool } from "./entity-update-tool";
import type { SystemServices } from "./types";

export function createEntityMutationTools(services: SystemServices): Tool[] {
  return [
    createEntityCreateTool(services),
    createEntityDeleteTool(services),
    createEntityUpdateTool(services),
    createEntityExtractTool(services),
    createEntityCoverTool(services),
  ];
}
