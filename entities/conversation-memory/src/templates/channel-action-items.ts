import { createTemplate } from "@brains/plugins";
import { CHANNEL_ACTION_ITEMS_TEMPLATE_NAME } from "../lib/constants";
import {
  channelActionItemExtractionSchema,
  type ChannelActionItemExtraction,
} from "../lib/channel-action-items/schema";

export const channelActionItemsTemplate: ReturnType<
  typeof createTemplate<ChannelActionItemExtraction>
> = createTemplate<ChannelActionItemExtraction>({
  name: CHANNEL_ACTION_ITEMS_TEMPLATE_NAME,
  description: "Find the action items a team channel's new messages commit to",
  schema: channelActionItemExtractionSchema,
  dataSourceId: "shell:ai-content",
  useKnowledgeContext: false,
  requiredPermission: "public",
  basePrompt: `Find action items in a team channel's new messages.

Cite only the new messages. Never invent tasks, owners, or dates. Return only
the required structured JSON.`,
});
