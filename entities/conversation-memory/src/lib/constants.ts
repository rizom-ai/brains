import { CONVERSATION_SUMMARY_ENTITY_TYPE } from "@brains/action-items";

export const SUMMARY_PLUGIN_ID = "conversation-memory";
export const SUMMARY_ENTITY_TYPE: typeof CONVERSATION_SUMMARY_ENTITY_TYPE =
  CONVERSATION_SUMMARY_ENTITY_TYPE;
export const DECISION_ENTITY_TYPE = "decision";
export const INSIGHT_ENTITY_TYPE = "insight";
export const SUMMARY_DATASOURCE_ID = "conversation-memory:entities";
export const CHANNEL_ACTION_ITEMS_TEMPLATE_NAME =
  "conversation-memory:channel-action-items";
export const CHANNEL_DECISIONS_TEMPLATE_NAME =
  "conversation-memory:channel-decisions";
