import type { Tool } from "@brains/mcp-service";
import type { SystemServices } from "./types";
import { createConversationTools } from "./conversation-tools";
import { createEntityMutationTools } from "./entity-mutation-tools";
import { createEntityReadTools } from "./entity-read-tools";
import { createInsightTools } from "./insight-tools";
import { createJobTools } from "./job-tools";
import { createStatusTools } from "./status-tools";

export function createSystemTools(services: SystemServices): Tool[] {
  return [
    ...createEntityReadTools(services),
    ...createJobTools(services),
    ...createConversationTools(services),
    ...createStatusTools(services),
    ...createEntityMutationTools(services),
    ...createInsightTools(services),
  ];
}
