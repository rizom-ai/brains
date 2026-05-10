import { type EntityPluginContext, type Message } from "@brains/plugins";
import { pLimit, truncateText, type Logger } from "@brains/utils";
import { computeContentHash } from "@brains/utils/hash";
import {
  ACTION_ITEM_ENTITY_TYPE,
  DECISION_ENTITY_TYPE,
  SUMMARY_ENTITY_TYPE,
} from "./constants";
import {
  ActionItemAdapter,
  DecisionAdapter,
} from "../adapters/conversation-memory-adapters";
import { SummaryAdapter } from "../adapters/summary-adapter";
import type {
  ActionItemEntity,
  ActionItemMetadata,
  DecisionEntity,
  DecisionMetadata,
} from "../schemas/conversation-memory";
import {
  summaryProjectionDecisionSchema,
  type SummaryProjectionDecision,
} from "../schemas/extraction";
import type {
  SummaryConfig,
  SummaryEntity,
  SummaryEntry,
  SummaryMetadata,
} from "../schemas/summary";
import {
  SummaryExtractor,
  type ExtractedConversationMemoryItem,
} from "./summary-extractor";
import { buildSummaryProjectionDecisionPrompt } from "./summary-prompt";
import {
  evaluateSummaryEligibility,
  type SummaryEligibilityReason,
} from "./summary-space-eligibility";
import { SummarySourceReader } from "./summary-source-reader";

const CHUNK_EXTRACTION_CONCURRENCY = 3;

interface ProjectedConversationMemory {
  entries: SummaryEntry[];
  decisions: ExtractedConversationMemoryItem[];
  actionItems: ExtractedConversationMemoryItem[];
}

export interface ProjectSummaryResult {
  conversationId: string;
  created: boolean;
  skipped: boolean;
  entryCount: number;
  messageCount: number;
  sourceHash: string;
  skipReason?: SummaryEligibilityReason | "unchanged" | "ai-skip";
}

export class SummaryProjector {
  private readonly adapter = new SummaryAdapter();
  private readonly decisionAdapter = new DecisionAdapter();
  private readonly actionItemAdapter = new ActionItemAdapter();
  private readonly sourceReader: SummarySourceReader;
  private readonly extractor: SummaryExtractor;

  constructor(
    private readonly context: EntityPluginContext,
    private readonly logger: Logger,
    private readonly config: SummaryConfig,
  ) {
    this.sourceReader = new SummarySourceReader(context, config);
    this.extractor = new SummaryExtractor(context, logger, config);
  }

  public async projectConversation(
    conversationId: string,
  ): Promise<ProjectSummaryResult> {
    const source = await this.sourceReader.readConversation(conversationId);

    const eligibility = evaluateSummaryEligibility({
      conversation: source.conversation,
      spaces: this.context.spaces,
      messages: source.messages,
    });
    if (!eligibility.eligible) {
      this.logger.info("Skipping conversation memory projection", {
        conversationId,
        reason: eligibility.reason,
        spaceId: eligibility.spaceId,
      });
      return {
        conversationId,
        created: false,
        skipped: true,
        entryCount: 0,
        messageCount: source.messages.length,
        sourceHash: source.sourceHash,
        skipReason: eligibility.reason,
      };
    }

    const existing = await this.context.entityService.getEntity<SummaryEntity>({
      entityType: SUMMARY_ENTITY_TYPE,
      id: conversationId,
    });

    if (existing?.metadata.sourceHash === source.sourceHash) {
      return {
        conversationId,
        created: false,
        skipped: true,
        entryCount: existing.metadata.entryCount,
        messageCount: existing.metadata.messageCount,
        sourceHash: source.sourceHash,
        skipReason: "unchanged",
      };
    }

    const decision = await this.decideProjection(source.messages, existing);
    if (decision.decision === "skip") {
      this.logger.info(
        "Skipping conversation memory projection by AI decision",
        {
          conversationId,
          rationale: decision.rationale,
        },
      );
      return {
        conversationId,
        created: false,
        skipped: true,
        entryCount: existing?.metadata.entryCount ?? 0,
        messageCount: source.messages.length,
        sourceHash: source.sourceHash,
        skipReason: "ai-skip",
      };
    }

    const projected = await this.extractProjectedMemory(
      source.messages,
      existing,
      decision.decision,
    );
    if (
      projected.entries.length === 0 &&
      projected.decisions.length === 0 &&
      projected.actionItems.length === 0
    ) {
      return {
        conversationId,
        created: false,
        skipped: true,
        entryCount: existing?.metadata.entryCount ?? 0,
        messageCount: source.messages.length,
        sourceHash: source.sourceHash,
        skipReason: "ai-skip",
      };
    }

    const timeRange = this.getTimeRange(source.messages);
    const metadata: SummaryMetadata = {
      conversationId,
      channelId: source.conversation.channelId,
      ...(source.conversation.channelName
        ? { channelName: source.conversation.channelName }
        : {}),
      interfaceType: source.conversation.interfaceType,
      ...(timeRange ? { timeRange } : {}),
      messageCount: source.messages.length,
      entryCount: projected.entries.length,
      sourceHash: source.sourceHash,
      projectionVersion: this.config.projectionVersion,
    };

    const content = this.adapter.composeContent(projected.entries, metadata);

    const now = new Date().toISOString();
    const entity: SummaryEntity = {
      id: conversationId,
      entityType: SUMMARY_ENTITY_TYPE,
      content,
      contentHash: computeContentHash(content),
      created: existing?.created ?? now,
      updated: now,
      metadata,
    };

    await this.context.entityService.upsertEntity({ entity });

    if (decision.decision === "update") {
      await this.deleteConversationMemory(conversationId);
    }
    await this.upsertConversationMemory(projected, metadata, now);

    this.logger.info("Projected conversation memory", {
      conversationId,
      entryCount: projected.entries.length,
      decisionCount: projected.decisions.length,
      actionItemCount: projected.actionItems.length,
      messageCount: source.messages.length,
    });

    return {
      conversationId,
      created: existing === null,
      skipped: false,
      entryCount: projected.entries.length,
      messageCount: source.messages.length,
      sourceHash: source.sourceHash,
    };
  }

  public async decideProjection(
    messages: Message[],
    existing: SummaryEntity | null,
  ): Promise<SummaryProjectionDecision> {
    const decisionMessages = this.getNewOrChangedMessages(messages, existing);
    const prompt = buildSummaryProjectionDecisionPrompt({
      existingSummary: existing?.content,
      messages: decisionMessages,
    });
    const { object } = await this.context.ai.generateObject(
      prompt,
      summaryProjectionDecisionSchema,
    );
    const decision = summaryProjectionDecisionSchema.parse(object);

    if (!existing && decision.decision === "append") {
      return { ...decision, decision: "update" };
    }

    return decision;
  }

  private async extractProjectedMemory(
    messages: Message[],
    existing: SummaryEntity | null,
    decision: "update" | "append",
  ): Promise<ProjectedConversationMemory> {
    if (decision === "update" || !existing) {
      return this.extractMemory(messages);
    }

    const newMemory = await this.extractMemory(
      this.getNewOrChangedMessages(messages, existing),
    );
    const existingEntries = this.adapter.parseBody(existing.content).entries;

    return {
      entries: this.compactEntries([...existingEntries, ...newMemory.entries]),
      decisions: newMemory.decisions,
      actionItems: newMemory.actionItems,
    };
  }

  private getNewOrChangedMessages(
    messages: Message[],
    existing: SummaryEntity | null,
  ): Message[] {
    if (!existing) return messages;

    const offset = existing.metadata.messageCount;
    if (offset <= 0 || offset >= messages.length) return messages;
    return messages.slice(offset);
  }

  private async extractMemory(
    messages: Message[],
  ): Promise<ProjectedConversationMemory> {
    if (messages.length === 0) {
      return { entries: [], decisions: [], actionItems: [] };
    }

    const chunks = this.chunkMessages(messages);
    const limit = pLimit(CHUNK_EXTRACTION_CONCURRENCY);
    const chunkResults = await Promise.all(
      chunks.map((chunk) => limit(() => this.extractor.extract(chunk))),
    );

    return {
      entries: this.compactEntries(
        chunkResults.flatMap((result) => result.entries),
      ),
      decisions: chunkResults.flatMap((result) => result.decisions),
      actionItems: chunkResults.flatMap((result) => result.actionItems),
    };
  }

  private async deleteConversationMemory(
    conversationId: string,
  ): Promise<void> {
    const limit = this.config.maxEntries * 4;
    const [decisions, actionItems] = await Promise.all([
      this.context.entityService.listEntities<DecisionEntity>({
        entityType: DECISION_ENTITY_TYPE,
        options: { filter: { metadata: { conversationId } }, limit },
      }),
      this.context.entityService.listEntities<ActionItemEntity>({
        entityType: ACTION_ITEM_ENTITY_TYPE,
        options: { filter: { metadata: { conversationId } }, limit },
      }),
    ]);

    await Promise.all([
      ...decisions.map((entity) =>
        this.context.entityService.deleteEntity({
          entityType: DECISION_ENTITY_TYPE,
          id: entity.id,
        }),
      ),
      ...actionItems.map((entity) =>
        this.context.entityService.deleteEntity({
          entityType: ACTION_ITEM_ENTITY_TYPE,
          id: entity.id,
        }),
      ),
    ]);
  }

  private async upsertConversationMemory(
    projected: ProjectedConversationMemory,
    summaryMetadata: SummaryMetadata,
    now: string,
  ): Promise<void> {
    const decisionEntities = projected.decisions.map((item, index) =>
      this.createDecisionEntity(item, summaryMetadata, index, now),
    );
    const actionItemEntities = projected.actionItems.map((item, index) =>
      this.createActionItemEntity(item, summaryMetadata, index, now),
    );

    await Promise.all(
      [...decisionEntities, ...actionItemEntities].map((entity) =>
        this.context.entityService.upsertEntity({ entity }),
      ),
    );
  }

  private createDecisionEntity(
    item: ExtractedConversationMemoryItem,
    summaryMetadata: SummaryMetadata,
    index: number,
    now: string,
  ): DecisionEntity {
    const metadata: DecisionMetadata = {
      conversationId: summaryMetadata.conversationId,
      channelId: summaryMetadata.channelId,
      ...(summaryMetadata.channelName
        ? { channelName: summaryMetadata.channelName }
        : {}),
      interfaceType: summaryMetadata.interfaceType,
      spaceId: this.getSpaceId(summaryMetadata),
      timeRange: item.timeRange,
      sourceSummaryId: summaryMetadata.conversationId,
      sourceMessageCount: item.sourceMessageCount,
      projectionVersion: summaryMetadata.projectionVersion,
      status: "active",
    };
    const title = this.titleForMemory("Decision", item.text);
    const content = this.decisionAdapter.composeContent(
      title,
      item.text,
      metadata,
    );

    return {
      id: this.memoryEntityId(
        summaryMetadata.conversationId,
        "decision",
        index,
        item.text,
      ),
      entityType: DECISION_ENTITY_TYPE,
      content,
      contentHash: computeContentHash(content),
      created: now,
      updated: now,
      metadata,
    };
  }

  private createActionItemEntity(
    item: ExtractedConversationMemoryItem,
    summaryMetadata: SummaryMetadata,
    index: number,
    now: string,
  ): ActionItemEntity {
    const metadata: ActionItemMetadata = {
      conversationId: summaryMetadata.conversationId,
      channelId: summaryMetadata.channelId,
      ...(summaryMetadata.channelName
        ? { channelName: summaryMetadata.channelName }
        : {}),
      interfaceType: summaryMetadata.interfaceType,
      spaceId: this.getSpaceId(summaryMetadata),
      timeRange: item.timeRange,
      sourceSummaryId: summaryMetadata.conversationId,
      sourceMessageCount: item.sourceMessageCount,
      projectionVersion: summaryMetadata.projectionVersion,
      status: "open",
    };
    const title = this.titleForMemory("Action item", item.text);
    const content = this.actionItemAdapter.composeContent(
      title,
      item.text,
      metadata,
    );

    return {
      id: this.memoryEntityId(
        summaryMetadata.conversationId,
        "action-item",
        index,
        item.text,
      ),
      entityType: ACTION_ITEM_ENTITY_TYPE,
      content,
      contentHash: computeContentHash(content),
      created: now,
      updated: now,
      metadata,
    };
  }

  private memoryEntityId(
    conversationId: string,
    type: "decision" | "action-item",
    index: number,
    text: string,
  ): string {
    return `${conversationId}:${type}:${index + 1}:${computeContentHash(text).slice(0, 12)}`;
  }

  private titleForMemory(prefix: string, text: string): string {
    const normalized = text.replace(/\s+/g, " ").trim();
    return `${prefix}: ${truncateText(normalized, 80)}`;
  }

  private getSpaceId(metadata: SummaryMetadata): string {
    return `${metadata.interfaceType}:${metadata.channelId}`;
  }

  private chunkMessages(messages: Message[]): Message[][] {
    const chunks: Message[][] = [];
    for (
      let index = 0;
      index < messages.length;
      index += this.config.maxMessagesPerChunk
    ) {
      chunks.push(
        messages.slice(index, index + this.config.maxMessagesPerChunk),
      );
    }
    return chunks;
  }

  private compactEntries(entries: SummaryEntry[]): SummaryEntry[] {
    if (entries.length <= this.config.maxEntries) return entries;

    const compacted: SummaryEntry[] = [];
    const groupSize = Math.ceil(entries.length / this.config.maxEntries);

    for (let index = 0; index < entries.length; index += groupSize) {
      const group = entries.slice(index, index + groupSize);
      const first = group[0];
      const last = group[group.length - 1];
      if (!first || !last) continue;

      compacted.push({
        title:
          first.title === last.title
            ? first.title
            : `${first.title} → ${last.title}`,
        summary: group.map((entry) => entry.summary).join("\n\n"),
        timeRange: {
          start: first.timeRange.start,
          end: last.timeRange.end,
        },
        sourceMessageCount: group.reduce(
          (total, entry) => total + entry.sourceMessageCount,
          0,
        ),
        keyPoints: [...new Set(group.flatMap((entry) => entry.keyPoints))],
      });
    }

    return compacted.slice(0, this.config.maxEntries);
  }

  private getTimeRange(
    messages: { timestamp: string }[],
  ): { start: string; end: string } | undefined {
    const first = messages[0];
    const last = messages[messages.length - 1];
    if (!first || !last) return undefined;
    return { start: first.timestamp, end: last.timestamp };
  }
}
