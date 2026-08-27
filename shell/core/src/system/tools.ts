import type { Tool } from "@brains/mcp-service";
import type { SystemServices } from "./types";
import { createEntityMutationTools } from "./entity-mutation-tools";
import { createEntityReadTools } from "./entity-read-tools";
import { createInsightTools } from "./insight-tools";
import { createJobTools } from "./job-tools";
import { createStatusTools } from "./status-tools";
import { createConversationProjectionBackfillTools } from "./conversation-projection-backfill-tool";

export function createSystemTools(services: SystemServices): Tool[] {
  return [
    ...createEntityReadTools(services),
    ...createJobTools(services),
    ...createStatusTools(services),
    ...createConversationProjectionBackfillTools(services),
    ...createEntityMutationTools(services),
    ...createInsightTools(services),
  ];
}
