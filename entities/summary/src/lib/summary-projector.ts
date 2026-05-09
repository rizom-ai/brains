import { type EntityPluginContext, type Message } from "@brains/plugins";
import { pLimit, type Logger } from "@brains/utils";
import { computeContentHash } from "@brains/utils/hash";

const CHUNK_EXTRACTION_CONCURRENCY = 3;
import { SUMMARY_ENTITY_TYPE } from "./constants";
import { SummaryAdapter } from "../adapters/summary-adapter";
import type {
  SummaryConfig,
  SummaryEntity,
  SummaryEntry,
  SummaryMetadata,
} from "../schemas/summary";
import { SummaryExtractor } from "./summary-extractor";
import { buildSummaryProjectionDecisionPrompt } from "./summary-prompt";
import {
  evaluateSummaryEligibility,
  type SummaryEligibilityReason,
} from "./summary-space-eligibility";
import { SummarySourceReader } from "./summary-source-reader";
import {
  summaryProjectionDecisionSchema,
  type SummaryProjectionDecision,
} from "../schemas/extraction";

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
      this.logger.info("Skipping conversation summary projection", {
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

    let existing: SummaryEntity | null = null;
    try {
      existing = await this.context.entityService.getEntity<SummaryEntity>({
        entityType: SUMMARY_ENTITY_TYPE,
        id: conversationId,
      });
    } catch {
      existing = null;
    }

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
        "Skipping conversation summary projection by AI decision",
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

    const entries = await this.extractProjectedEntries(
      source.messages,
      existing,
      decision.decision,
    );
    if (entries.length === 0) {
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
      entryCount: entries.length,
      sourceHash: source.sourceHash,
      projectionVersion: this.config.projectionVersion,
    };

    const content = this.adapter.composeContent(entries, metadata);

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

    this.logger.info("Projected conversation summary", {
      conversationId,
      entryCount: entries.length,
      messageCount: source.messages.length,
    });

    return {
      conversationId,
      created: existing === null,
      skipped: false,
      entryCount: entries.length,
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

  private async extractProjectedEntries(
    messages: Message[],
    existing: SummaryEntity | null,
    decision: "update" | "append",
  ): Promise<SummaryEntry[]> {
    if (decision === "update" || !existing) {
      return this.extractEntries(messages);
    }

    const newEntries = await this.extractEntries(
      this.getNewOrChangedMessages(messages, existing),
    );
    if (newEntries.length === 0) return [];

    const existingEntries = this.adapter.parseBody(existing.content).entries;
    return this.compactEntries([...existingEntries, ...newEntries]);
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

  private async extractEntries(messages: Message[]): Promise<SummaryEntry[]> {
    if (messages.length === 0) return [];

    const chunks = this.chunkMessages(messages);
    const limit = pLimit(CHUNK_EXTRACTION_CONCURRENCY);
    const chunkResults = await Promise.all(
      chunks.map((chunk) => limit(() => this.extractor.extract(chunk))),
    );

    return this.compactEntries(chunkResults.flat());
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
        keyPoints: this.unique(group.flatMap((entry) => entry.keyPoints)),
        decisions: this.unique(group.flatMap((entry) => entry.decisions)),
        actionItems: this.unique(group.flatMap((entry) => entry.actionItems)),
      });
    }

    return compacted.slice(0, this.config.maxEntries);
  }

  private unique(items: string[]): string[] {
    return Array.from(new Set(items));
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
