import { defineEntity, type EntityDefinition } from "@brains/sdk/entities";
import { memoryMarkdown } from "./lib/memory-markdown";
import {
  migrateSummaryMetadata,
  summaryMetadataSchema,
} from "./schemas/summary";
import { SUMMARY_ENTITY_TYPE } from "./lib/constants";
import { summaryDataSource } from "./datasources/summary-datasource";
import { conversationMemoryAgentContext } from "./lib/agent-context-provider";
import { decisionsWidgetDeclaration } from "./lib/widgets/decisions";
import { actionItemsWidgetDeclaration } from "./lib/widgets/action-items";
import { recentMemoryWidgetDeclaration } from "./lib/widgets/recent-memory-register";
import { summaryListTemplate } from "./templates/summary-list";
import { summaryDetailTemplate } from "./templates/summary-detail";
import { summaryAiResponseTemplate } from "./templates/summary-ai-response";

/**
 * A read-only, system-maintained summary derived from stored conversation
 * messages.
 *
 * Read-only in the strict sense: nobody creates, edits or deletes one by
 * hand. The scheduler maintains it from changed conversations in configured
 * spaces.
 */
export const summary: EntityDefinition<
  typeof SUMMARY_ENTITY_TYPE,
  typeof summaryMetadataSchema
> = defineEntity({
  type: SUMMARY_ENTITY_TYPE,
  purpose:
    "A read-only, system-maintained summary derived from stored conversation messages.",
  metadata: summaryMetadataSchema,
  metadataFrom: migrateSummaryMetadata,
  markdown: memoryMarkdown,
  config: { projectionSource: false, projectionSourceRole: "excluded" },
  // Nobody edits a summary by hand. A user who could rewrite one could
  // rewrite what the brain remembers happening.
  actions: {
    create: "never",
    update: "never",
    delete: "never",
    extract: "never",
    publish: "never",
  },
  templates: {
    "summary-list": summaryListTemplate,
    "summary-detail": summaryDetailTemplate,
    "ai-response": summaryAiResponseTemplate,
  },
  dataSources: [summaryDataSource],
  // Coverage is declared on the package rather than here: what counts as
  // covered depends on config, which an entity definition does not see.
  dashboardWidgets: [
    decisionsWidgetDeclaration,
    actionItemsWidgetDeclaration,
    recentMemoryWidgetDeclaration,
  ],
  agentContext: conversationMemoryAgentContext,
});
