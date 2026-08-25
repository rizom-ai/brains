import {
  defineServicePlugin,
  type ServicePackageDefinition,
} from "@brains/sdk/services";
import { summaryConfigSchema } from "./schemas/summary-config";
import { summary } from "./summary-entity";
import { actionItem, decision } from "./memory-entities";
import { summaryEvalHandlers } from "./lib/eval-handlers";

/**
 * Conversation memory: three derived entity types and everything that reads
 * them.
 *
 * A service package rather than a bare entity one because what the coverage
 * widget reports and what the projector would write both depend on config —
 * which spaces count, how far back to read, what visibility derived memory
 * carries.
 *
 * Automatic conversation-to-entity projection is disabled (see the README).
 * What exists is what was derived before that, and everything here reads it.
 */
export const conversationMemory: ServicePackageDefinition<
  typeof summaryConfigSchema
> = defineServicePlugin({
  id: "conversation-memory",
  config: summaryConfigSchema,
  entities: [summary, decision, actionItem],
  evals: ({ config }) => summaryEvalHandlers(config),
});

export default conversationMemory;
