import {
  ProjectionJsonObjectSchema,
  computeContentHash,
  type BaseEntity,
  type Conversation,
  type IEntityAINamespace,
  type Message,
  type ProjectionExecutionContext,
  type ProjectionInputContext,
  type ProjectionWriteIntent,
} from "@brains/sdk/entities";
import type { SummaryConfig } from "../schemas/summary-config";
import { SUMMARY_AI_TEMPLATE_NAME } from "./constants";
import type { SummaryEntity } from "../schemas/summary";
import {
  createActionItemProjectionRule,
  createDecisionProjectionRule,
} from "./memory-projection-rules";
import { computeSummarySourceHash } from "./summary-source-reader";
import {
  createSummaryProjectionRule,
  type SummaryProjectionInput,
} from "./summary-rule";

export interface MemoryRuleChainInput {
  conversation: Conversation;
  messages: Message[];
  existingSummary: SummaryEntity | null;
  projectionDecision: "update" | "append";
}

export interface MemoryRuleChainResult {
  skipped: boolean;
  projectionDecision: "update" | "append";
  summaries: BaseEntity[];
  decisions: BaseEntity[];
  actionItems: BaseEntity[];
  deleted: Array<{ entityType: string; id: string }>;
}

function selectedInput(
  input: MemoryRuleChainInput,
  config: SummaryConfig,
): SummaryProjectionInput {
  const { conversation, messages, existingSummary } = input;
  return {
    conversations: [
      {
        id: conversation.id,
        sessionId: conversation.sessionId,
        channelId: conversation.channelId,
        channelName: conversation.channelName ?? null,
        interfaceType: conversation.interfaceType,
        personId: conversation.personId ?? null,
        startedAt: conversation.startedAt,
        lastActiveAt: conversation.lastActiveAt,
        createdAt: conversation.createdAt,
        updatedAt: conversation.updatedAt,
        metadata: ProjectionJsonObjectSchema.parse(conversation.metadata),
        messages: messages.map((message) => ({
          id: message.id,
          role: message.role === "assistant" ? "assistant" : "user",
          content: message.content,
          timestamp: message.timestamp,
          metadata: ProjectionJsonObjectSchema.parse(message.metadata),
        })),
        sourceHash: computeSummarySourceHash(
          conversation,
          messages,
          config.projectionVersion,
        ),
        existing: existingSummary
          ? {
              content: existingSummary.content,
              visibility: existingSummary.visibility,
              created: existingSummary.created,
              updated: existingSummary.updated,
              metadata: ProjectionJsonObjectSchema.parse(
                existingSummary.metadata,
              ),
            }
          : null,
      },
    ],
    memoryVisibility: config.memoryVisibility,
    model: "eval-model",
  };
}

function materializeEntity(
  entity: Extract<ProjectionWriteIntent, { operation: "upsert" }>["entity"],
): BaseEntity {
  const now = "2026-01-01T00:00:00.000Z";
  return {
    ...entity,
    contentHash: computeContentHash(entity.content),
    created: now,
    updated: now,
  };
}

function upserted(intents: readonly ProjectionWriteIntent[]): BaseEntity[] {
  return intents.flatMap((intent) =>
    intent.operation === "upsert" ? [materializeEntity(intent.entity)] : [],
  );
}

function deleted(
  intents: readonly ProjectionWriteIntent[],
): Array<{ entityType: string; id: string }> {
  return intents.flatMap((intent) =>
    intent.operation === "delete"
      ? [{ entityType: intent.entityType, id: intent.id }]
      : [],
  );
}

/** Execute the production three-rule graph over synthetic, in-memory inputs. */
export async function runMemoryRuleChain(
  input: MemoryRuleChainInput,
  dependencies: {
    ai: IEntityAINamespace;
    logger: ProjectionExecutionContext["logger"];
  },
  config: SummaryConfig,
  extractionTemplateName: string = SUMMARY_AI_TEMPLATE_NAME,
): Promise<MemoryRuleChainResult> {
  const summaryRule = createSummaryProjectionRule(
    config,
    extractionTemplateName,
  );
  const executionContext: ProjectionExecutionContext = {
    ai: {
      ...dependencies.ai,
      generateObject: async <T>() =>
        ({
          object: {
            decision: input.projectionDecision,
            rationale: "Forced by eval input",
          } as T,
        }) as { object: T },
    },
    logger: dependencies.logger,
  };
  const summaryOutput = await summaryRule.derive(
    selectedInput(input, config),
    executionContext,
    new AbortController().signal,
  );
  const summaryIntents: readonly ProjectionWriteIntent[] = Array.isArray(
    summaryOutput,
  )
    ? summaryOutput
    : [];
  const summaries = upserted(summaryIntents);
  const summary = summaries[0];
  if (!summary) {
    return {
      skipped: true,
      projectionDecision: input.projectionDecision,
      summaries: [],
      decisions: [],
      actionItems: [],
      deleted: [],
    };
  }

  const inputContext: ProjectionInputContext = {
    spaces: [
      `${input.conversation.interfaceType}:${input.conversation.channelId}`,
    ],
    entities: {
      getEntity: async <T>({
        entityType,
        id,
      }: {
        entityType: string;
        id: string;
      }) =>
        (entityType === "summary" && id === summary.id
          ? summary
          : null) as T | null,
      getEntities: async ({
        entityType,
        ids,
      }: {
        entityType: string;
        ids: readonly string[];
      }) =>
        entityType === "summary" && ids.includes(summary.id) ? [summary] : [],
      listEntities: async <T>() => [] as T[],
      getEntityTypes: () => ["summary", "decision", "action-item"],
      hasEntityType: () => true,
      getEntityTypeConfig: () => {
        throw new Error("Rule-chain eval does not read entity type config");
      },
      // Added to the reader after this chain was written, for rules that
      // must not overwrite an authored entity. The memory rules are
      // additive and never ask, so this fails loudly rather than answering
      // for a harness that holds no ownership records.
      isProjectionOwnedEntity: () => {
        throw new Error("Rule-chain eval does not track projection ownership");
      },
    },
    conversations: {
      get: async () => input.conversation,
      getMessages: async () => input.messages,
      getManyWithMessages: async () => [
        { conversation: input.conversation, messages: input.messages },
      ],
    },
    resolvePrompt: async (_reference, fallback) => fallback,
    appInfo: async () => {
      throw new Error("Rule-chain eval does not read app info");
    },
    identityInput: () => ({}),
  };
  const trigger = {
    waveId: "eval-wave",
    inputs: [
      {
        sourceType: "summary",
        sourceId: summary.id,
        revision: summary.contentHash,
        operation: "upsert" as const,
      },
    ],
  };
  const rules = [
    createDecisionProjectionRule(config),
    createActionItemProjectionRule(config),
  ];
  const downstream: ProjectionWriteIntent[] = [];
  for (const rule of rules) {
    const selected = await rule.selectInput(
      trigger,
      inputContext,
      new AbortController().signal,
    );
    const output = await rule.derive(
      selected,
      executionContext,
      new AbortController().signal,
    );
    if (Array.isArray(output)) downstream.push(...output);
  }
  const entities = upserted(downstream);

  return {
    skipped: false,
    projectionDecision: input.projectionDecision,
    summaries,
    decisions: entities.filter((entity) => entity.entityType === "decision"),
    actionItems: entities.filter(
      (entity) => entity.entityType === "action-item",
    ),
    deleted: deleted(downstream),
  };
}
