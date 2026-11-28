import { createTemplate } from "@brains/sdk/internal/presentation";
import { CHANNEL_DECISIONS_TEMPLATE_NAME } from "../lib/constants";
import {
  channelDecisionExtractionSchema,
  type ChannelDecisionExtraction,
} from "../lib/channel-pickup/decision-schema";

export const channelDecisionsTemplate: ReturnType<
  typeof createTemplate<ChannelDecisionExtraction>
> = createTemplate<ChannelDecisionExtraction>({
  name: CHANNEL_DECISIONS_TEMPLATE_NAME,
  description: "Find the decisions a team channel's new messages settle",
  schema: channelDecisionExtractionSchema,
  dataSourceId: "shell:ai-content",
  useKnowledgeContext: false,
  requiredPermission: "public",
  basePrompt: `Find decisions in a team channel's new messages.

Cite only the new messages. Never invent decisions or who made them. Return
only the required structured JSON.`,
});
