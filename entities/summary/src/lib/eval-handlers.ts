import type { EntityPluginContext, Message } from "@brains/plugins";
import type { Logger } from "@brains/utils";
import { z } from "@brains/utils";
import type { SummaryConfig } from "../schemas/summary";
import { SummaryExtractor } from "./summary-extractor";
import { SummaryProjector } from "./summary-projector";

const evalMessageSchema = z.object({
  role: z.enum(["user", "assistant", "system"]),
  content: z.string(),
  timestamp: z.string().datetime().optional(),
});

const summarizeMessagesInputSchema = z.object({
  conversationId: z.string().default("eval-conversation"),
  messages: z.array(evalMessageSchema),
});

const projectConversationInputSchema = z.object({
  conversationId: z.string(),
});

export function registerSummaryEvalHandlers(params: {
  context: EntityPluginContext;
  logger: Logger;
  config: SummaryConfig;
}): void {
  const { context, logger, config } = params;

  context.eval.registerHandler("summarizeMessages", async (input: unknown) => {
    const parsed = summarizeMessagesInputSchema.parse(input);
    const messages = parsed.messages.map((message, index): Message => {
      const timestamp =
        message.timestamp ??
        new Date(Date.UTC(2026, 0, 1, 0, index)).toISOString();
      return {
        id: `eval-message-${index + 1}`,
        conversationId: parsed.conversationId,
        role: message.role,
        content: message.content,
        timestamp,
        metadata: {},
      };
    });

    const extractor = new SummaryExtractor(context, logger, config);
    const entries = await extractor.extract(messages);
    return entries.map((entry) => ({
      ...entry,
      keyPointsText: entry.keyPoints.join("\n"),
      decisionsText: entry.decisions.join("\n"),
      actionItemsText: entry.actionItems.join("\n"),
    }));
  });

  context.eval.registerHandler(
    "projectConversation",
    async (input: unknown) => {
      const parsed = projectConversationInputSchema.parse(input);
      const projector = new SummaryProjector(context, logger, config);
      return projector.projectConversation(parsed.conversationId);
    },
  );
}
