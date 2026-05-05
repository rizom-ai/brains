import {
  generateMarkdownWithFrontmatter,
  type EntityPluginContext,
  type Message,
} from "@brains/plugins";
import type { Logger } from "@brains/utils";
import { computeContentHash } from "@brains/utils/hash";
import { SUMMARY_ENTITY_TYPE } from "./constants";
import { SummaryAdapter } from "../adapters/summary-adapter";
import type {
  SummaryConfig,
  SummaryEntity,
  SummaryEntry,
  SummaryMetadata,
} from "../schemas/summary";
import { SummaryExtractor } from "./summary-extractor";
import { SummarySourceReader } from "./summary-source-reader";

export interface ProjectSummaryResult {
  conversationId: string;
  created: boolean;
  skipped: boolean;
  entryCount: number;
  messageCount: number;
  sourceHash: string;
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

    let existing: SummaryEntity | null = null;
    try {
      existing = await this.context.entityService.getEntity<SummaryEntity>(
        SUMMARY_ENTITY_TYPE,
        conversationId,
      );
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
      };
    }

    const entries = await this.extractEntries(source.messages);
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

    const contentBody = this.adapter.createContentBody(entries);
    const content = generateMarkdownWithFrontmatter(
      contentBody,
      metadata as unknown as Record<string, unknown>,
    );

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

    await this.context.entityService.upsertEntity(entity);

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

  private async extractEntries(messages: Message[]): Promise<SummaryEntry[]> {
    if (messages.length === 0) return [];

    const chunks = this.chunkMessages(messages);
    const entries: SummaryEntry[] = [];

    for (const chunk of chunks) {
      entries.push(...(await this.extractor.extract(chunk)));
    }

    return this.compactEntries(entries);
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
