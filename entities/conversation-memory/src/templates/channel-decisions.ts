import { createTemplate } from "@brains/sdk/internal/presentation";
import { CHANNEL_DECISIONS_TEMPLATE_NAME } from "../lib/constants";
import {
  channelClaimExtractionSchema,
  type ChannelClaimExtraction,
} from "../lib/channel-pickup/claim-schema";

export const channelDecisionsTemplate: ReturnType<
  typeof createTemplate<ChannelClaimExtraction>
> = createTemplate<ChannelClaimExtraction>({
  name: CHANNEL_DECISIONS_TEMPLATE_NAME,
  description: "Find the decisions a team channel's new messages settle",
  schema: channelClaimExtractionSchema,
  dataSourceId: "shell:ai-content",
  useKnowledgeContext: false,
  requiredPermission: "public",
  basePrompt: `Find decisions in a team channel's new messages.

Cite only the new messages. Never invent decisions or who made them. Return
only the required structured JSON.`,
});
