import { defineEntity, type EntityDefinition } from "@brains/sdk/entities";
import { memoryMarkdown } from "./lib/memory-markdown";
import {
  actionItemMetadataSchema,
  decisionMetadataSchema,
  migrateActionItemMetadata,
  migrateDecisionMetadata,
} from "./schemas/conversation-memory";
import { ACTION_ITEM_ENTITY_TYPE, DECISION_ENTITY_TYPE } from "./lib/constants";

/** A decision recorded from a conversation. */
export const decision: EntityDefinition<
  typeof DECISION_ENTITY_TYPE,
  typeof decisionMetadataSchema
> = defineEntity({
  type: DECISION_ENTITY_TYPE,
  purpose: "A decision recorded from a conversation.",
  metadata: decisionMetadataSchema,
  metadataFrom: migrateDecisionMetadata,
  markdown: memoryMarkdown,
  // Derived from conversations rather than authored, and never a source for
  // anything further.
  config: { projectionSource: false, projectionSourceRole: "excluded" },
});

/** An action item captured from a conversation. */
export const actionItem: EntityDefinition<
  typeof ACTION_ITEM_ENTITY_TYPE,
  typeof actionItemMetadataSchema
> = defineEntity({
  type: ACTION_ITEM_ENTITY_TYPE,
  purpose: "An action item captured from a conversation.",
  metadata: actionItemMetadataSchema,
  metadataFrom: migrateActionItemMetadata,
  markdown: memoryMarkdown,
  config: { projectionSource: false, projectionSourceRole: "excluded" },
});
