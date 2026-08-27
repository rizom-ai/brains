import {
  CONVERSATION_SOURCE_TYPE,
  PROJECTION_ABSTAINED,
  ProjectionJsonObjectSchema,
  computeContentHash,
  defineProjectionRule,
  z,
  type ProjectionAbstention,
  type ProjectionExecutionContext,
  type ProjectionInputContext,
  type ProjectionRule,
  type ProjectionWriteIntent,
} from "@brains/sdk/entities";
import { SUMMARY_ENTITY_TYPE } from "./constants";
import { composeSummaryBody } from "./summary-body";
import { memoryMarkdown } from "./memory-markdown";
import { SummaryExtractor } from "./summary-extractor";
import { evaluateSummaryEligibility } from "./summary-space-eligibility";
import type { SummaryConfig } from "../schemas/summary-config";
import type { SummaryEntity, SummaryMetadata } from "../schemas/summary";

export const SUMMARY_PROJECTION_ID = "summary-derivation";

const messageSchema = z.object({
  id: z.string(),
  role: z.enum(["user", "assistant"]),
  content: z.string(),
  timestamp: z.string(),
});

const conversationSchema = z.object({
  id: z.string(),
  channelId: z.string(),
  channelName: z.string().nullable(),
  interfaceType: z.string(),
  messages: z.array(messageSchema),
  sourceHash: z.string(),
});

const summaryInputSchema = z.object({
  conversations: z.array(conversationSchema),
  memoryVisibility: z.enum(["public", "shared", "restricted"]),
  model: z.string(),
});

type SummaryInput = z.output<typeof summaryInputSchema>;

/**
 * What the derivation is fingerprinted against.
 *
 * The model is in here because a model change should re-derive: the same
 * messages summarized by a different model is a different summary, and
 * without it the memo would serve the old one forever.
 */
function sourceHash(input: {
  readonly conversation: { readonly id: string; readonly updatedAt: string };
  readonly messages: readonly {
    readonly id: string;
    readonly content: string;
  }[];
  readonly projectionVersion: number;
}): string {
  return computeContentHash(
    JSON.stringify({
      projectionVersion: input.projectionVersion,
      conversationId: input.conversation.id,
      updatedAt: input.conversation.updatedAt,
      messages: input.messages.map(({ id, content }) => ({ id, content })),
    }),
  );
}

async function selectSummaryInput(
  trigger: Parameters<ProjectionRule["selectInput"]>[0],
  context: ProjectionInputContext,
  config: SummaryConfig,
  spaces: readonly string[],
): Promise<SummaryInput> {
  // Only what this wave was woken about. A summary rule that read every
  // conversation would re-derive the corpus on each message.
  const changed = trigger.inputs.filter(
    (input) =>
      input.sourceType === CONVERSATION_SOURCE_TYPE &&
      input.operation === "upsert",
  );

  const [appInfo, ...conversations] = await Promise.all([
    context.appInfo(),
    ...changed.map(async (input) => {
      const conversation = await context.conversations.get(input.sourceId);
      if (!conversation) return null;
      if (!evaluateSummaryEligibility({ conversation, spaces }).eligible) {
        return null;
      }
      const messages = await context.conversations.getMessages(input.sourceId, {
        limit: config.maxSourceMessages,
      });
      if (messages.length === 0) return null;
      return {
        id: conversation.id,
        channelId: conversation.channelId,
        channelName: conversation.channelName ?? null,
        interfaceType: conversation.interfaceType,
        messages: messages.map((message) => ({
          id: message.id,
          role:
            message.role === "assistant"
              ? ("assistant" as const)
              : ("user" as const),
          content: message.content,
          timestamp: message.timestamp,
        })),
        sourceHash: sourceHash({
          conversation,
          messages,
          projectionVersion: config.projectionVersion,
        }),
      };
    }),
  ]);

  return {
    conversations: conversations.filter((entry) => entry !== null),
    memoryVisibility: config.memoryVisibility,
    model: appInfo.ai.model,
  };
}

async function deriveSummaries(
  input: SummaryInput,
  context: ProjectionExecutionContext,
  signal: AbortSignal,
  config: SummaryConfig,
): Promise<readonly ProjectionWriteIntent[] | ProjectionAbstention> {
  // Woken by a conversation this rule does not summarize — a channel outside
  // the configured spaces, or one with nothing said in it yet. That is not a
  // claim that no summary should exist.
  if (input.conversations.length === 0) return PROJECTION_ABSTAINED;

  const extractor = new SummaryExtractor(context.ai, context.logger, config);
  const intents: ProjectionWriteIntent[] = [];

  for (const conversation of input.conversations) {
    if (signal.aborted) throw signal.reason;

    const extracted = await extractor.extract(
      conversation.messages.map((message) => ({
        ...message,
        conversationId: conversation.id,
        metadata: {},
      })),
    );
    // Nothing worth remembering was said. Leaving any prior summary in place
    // rather than writing an empty one over it.
    if (extracted.entries.length === 0) continue;

    const metadata: SummaryMetadata = {
      conversationId: conversation.id,
      channelId: conversation.channelId,
      ...(conversation.channelName
        ? { channelName: conversation.channelName }
        : {}),
      interfaceType: conversation.interfaceType,
      messageCount: conversation.messages.length,
      entryCount: extracted.entries.length,
      sourceHash: conversation.sourceHash,
      projectionVersion: config.projectionVersion,
    };

    intents.push({
      operation: "upsert",
      entity: {
        id: conversation.id,
        entityType: SUMMARY_ENTITY_TYPE,
        content: memoryMarkdown.encode({
          content: composeSummaryBody(extracted.entries),
          metadata,
        }).content,
        metadata: ProjectionJsonObjectSchema.parse(metadata),
        visibility: input.memoryVisibility,
      },
    });
  }

  return intents;
}

/**
 * Conversation memory: a summary of what was said, per conversation.
 *
 * Additive, not exclusive. A wave derives only the conversations it was
 * woken about, so "every summary this run did not mention" is every summary
 * for every other conversation — which is almost all of them.
 */
export function createSummaryProjectionRule(
  config: SummaryConfig,
  spaces: readonly string[],
): ProjectionRule {
  return defineProjectionRule({
    id: SUMMARY_PROJECTION_ID,
    version: String(config.projectionVersion),
    sources: [{ kind: "conversation" }],
    targetType: SUMMARY_ENTITY_TYPE,
    targets: { authority: "additive" },
    inputSchema: summaryInputSchema,
    selectInput: async (trigger, context) =>
      selectSummaryInput(trigger, context, config, spaces),
    derive: async (input, context, signal) =>
      deriveSummaries(input, context, signal, config),
  });
}

export type { SummaryEntity };
