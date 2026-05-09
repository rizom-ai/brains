import type { EntityPluginContext, Message } from "@brains/plugins";
import type { Logger } from "@brains/utils";
import { z } from "@brains/utils";
import type { SummaryConfig, SummaryEntity } from "../schemas/summary";
import { SummaryExtractor } from "./summary-extractor";
import { SummaryMemoryRetriever } from "./summary-memory-retriever";
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

const retrieveMemoryInputSchema = z.object({
  query: z.string().optional(),
  conversationId: z.string().optional(),
  interfaceType: z.string().optional(),
  channelId: z.string().optional(),
  limit: z.number().int().min(1).optional(),
  includeOtherSpaces: z.boolean().optional(),
});

const decideProjectionInputSchema = z.object({
  conversationId: z.string().default("eval-conversation"),
  existingSummary: z.string().optional(),
  existingMessageCount: z.number().int().min(0).default(0),
  messages: z.array(evalMessageSchema),
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

  context.eval.registerHandler("decideProjection", async (input: unknown) => {
    const parsed = decideProjectionInputSchema.parse(input);
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

    const existing = parsed.existingSummary
      ? createEvalSummaryEntity({
          conversationId: parsed.conversationId,
          content: parsed.existingSummary,
          messageCount: parsed.existingMessageCount,
          projectionVersion: config.projectionVersion,
        })
      : null;

    const projector = new SummaryProjector(context, logger, config);
    return projector.decideProjection(messages, existing);
  });

  context.eval.registerHandler("retrieveMemory", async (input: unknown) => {
    const parsed = retrieveMemoryInputSchema.parse(input);
    const retriever = new SummaryMemoryRetriever(context);
    return retriever.retrieve(parsed);
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

function createEvalSummaryEntity(params: {
  conversationId: string;
  content: string;
  messageCount: number;
  projectionVersion: number;
}): SummaryEntity {
  const now = "2026-01-01T00:00:00.000Z";
  return {
    id: params.conversationId,
    entityType: "summary",
    content: params.content,
    contentHash: "eval-existing-summary",
    created: now,
    updated: now,
    metadata: {
      conversationId: params.conversationId,
      channelId: "eval-channel",
      interfaceType: "eval",
      messageCount: params.messageCount,
      entryCount: 1,
      sourceHash: "eval-source-hash",
      projectionVersion: params.projectionVersion,
    },
  };
}
