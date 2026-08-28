import {
  defineServicePlugin,
  type ServicePackageDefinition,
} from "@brains/sdk/services";
import { summaryConfigSchema } from "./schemas/summary-config";
import { summary } from "./summary-entity";
import { actionItem, decision } from "./memory-entities";
import { summaryEvalHandlers } from "./lib/eval-handlers";
import { createSummaryProjectionRule } from "./lib/summary-rule";
import {
  createActionItemProjectionRule,
  createDecisionProjectionRule,
} from "./lib/memory-projection-rules";

/**
 * Conversation memory: three derived entity types and everything that reads
 * them.
 *
 * A service package rather than a bare entity one because what the coverage
 * widget reports and what the projector would write both depend on config —
 * which spaces count, how far back to read, what visibility derived memory
 * carries.
 *
 * Conversation changes feed one model-backed summary rule; two parse-only
 * rules project its structured memory into decisions and action items.
 */
export const conversationMemory: ServicePackageDefinition<
  typeof summaryConfigSchema
> = defineServicePlugin({
  id: "conversation-memory",
  config: summaryConfigSchema,
  entities: [summary, decision, actionItem],
  projectionRules: ({ config, template }) => [
    createSummaryProjectionRule(config, template("ai-response")),
    createDecisionProjectionRule(config),
    createActionItemProjectionRule(config),
  ],
  evals: ({ config, template }) =>
    summaryEvalHandlers(config, template("ai-response")),
});

export default conversationMemory;
