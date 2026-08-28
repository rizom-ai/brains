import {
  actorRefKey,
  computeContentHash,
  conversationMessageMetadataSchema,
  pLimit,
  truncateText,
  type ConversationMessageActor,
  type EntityConversationReader,
  type IEntityAINamespace,
  type JobEntityAccess,
  type LoggerContract,
  type Message,
} from "@brains/sdk/entities";
import {
  ACTION_ITEM_ENTITY_TYPE,
  DECISION_ENTITY_TYPE,
  SUMMARY_AI_TEMPLATE_NAME,
  SUMMARY_ENTITY_TYPE,
} from "./constants";
import type {
  ActionItemEntity,
  ActionItemMetadata,
  DecisionEntity,
  DecisionMetadata,
  MemoryActorReference,
} from "../schemas/conversation-memory";
import {
  summaryProjectionDecisionSchema,
  type SummaryProjectionDecision,
} from "../schemas/extraction";
import type {
  SummaryEntity,
  SummaryEntry,
  SummaryMetadata,
  SummaryParticipant,
} from "../schemas/summary";
import type { SummaryConfig } from "../schemas/summary-config";
import {
  SummaryExtractor,
  type ExtractedConversationMemoryItem,
} from "./summary-extractor";
import { buildSummaryProjectionDecisionPrompt } from "./summary-prompt";
import {
  evaluateSummaryEligibility,
  getConversationSpaceId,
  type SummaryEligibilityReason,
} from "./summary-space-eligibility";
import { SummarySourceReader } from "./summary-source-reader";
import { composeSummaryBody, parseSummaryBody } from "./summary-body";
import { composeMemoryBody, composeMemoryMarkdown } from "./memory-markdown";

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
  projectionDecision?: "update" | "append";
}

/** Lower-cased and whitespace-collapsed, for label matching. */
export function normalizeForAttribution(value: string): string {
  return value.toLocaleLowerCase().replace(/\s+/g, " ").trim();
}

/**
 * The actors whose display name, username or reference key appears in the text.
 *
 * A module-level function rather than a private method: it depends on nothing
 * but its arguments, and its test previously had to cast the projector to reach
 * it. Attribution is subtle enough to deserve testing directly instead of
 * through a whole projection run.
 */
export function getActorsMentionedInText(
  text: string,
  actors: ConversationMessageActor[],
): MemoryActorReference[] {
  const normalizedText = normalizeForAttribution(text);
  const seen = new Set<string>();
  const matches: MemoryActorReference[] = [];

  for (const actor of actors) {
    const key = actorRefKey(actor.identity);
    if (seen.has(key)) continue;
    const labels = [
      actor.displayName,
      actor.username,
      actorRefKey(actor.identity),
    ]
      .filter((label): label is string => Boolean(label?.trim()))
      .map((label) => normalizeForAttribution(label));
    if (!labels.some((label) => normalizedText.includes(label))) continue;

    seen.add(key);
    matches.push({
      identity: actor.identity,
      ...(actor.displayName ? { displayName: actor.displayName } : {}),
    });
  }

  return matches;
}

/** What a projection reads from and writes to. */
export interface SummaryProjectionContext {
  readonly ai: Pick<IEntityAINamespace, "generate" | "generateObject">;
  readonly entities: JobEntityAccess;
  readonly conversations: EntityConversationReader;
  readonly spaces: readonly string[];
}

function getNewOrChangedMessages(
  messages: Message[],
  existing: SummaryEntity | null,
): Message[] {
  if (!existing) return messages;

  const offset = existing.metadata.messageCount;
  if (offset <= 0 || offset >= messages.length) return messages;
  return messages.slice(offset);
}

export async function decideSummaryProjection(
  ai: Pick<IEntityAINamespace, "generateObject">,
  messages: Message[],
  existing: SummaryEntity | null,
): Promise<SummaryProjectionDecision> {
  const prompt = buildSummaryProjectionDecisionPrompt({
    existingSummary: existing?.content,
    messages: getNewOrChangedMessages(messages, existing),
  });
  const { object } = await ai.generateObject(
    prompt,
    summaryProjectionDecisionSchema,
  );
  const decision = summaryProjectionDecisionSchema.parse(object);

  return !existing && decision.decision === "append"
    ? { ...decision, decision: "update" }
    : decision;
}

class SummaryDerivation {
  private readonly context: SummaryProjectionContext;
  private readonly logger: LoggerContract;
  private readonly config: SummaryConfig;
  private readonly sourceReader: SummarySourceReader;
  private readonly extractor: SummaryExtractor;

  constructor(
    context: SummaryProjectionContext,
    logger: LoggerContract,
    config: SummaryConfig,
    extractionTemplateName: string = SUMMARY_AI_TEMPLATE_NAME,
  ) {
    this.context = context;
    this.logger = logger;
    this.config = config;
    this.sourceReader = new SummarySourceReader(context.conversations, config);
    this.extractor = new SummaryExtractor(
      context.ai,
      logger,
      config,
      extractionTemplateName,
    );
  }

  public async projectConversation(
    conversationId: string,
  ): Promise<ProjectSummaryResult> {
    const source = await this.sourceReader.readConversation(conversationId);

    const eligibility = evaluateSummaryEligibility({
      conversation: source.conversation,
      spaces: this.context.spaces,
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

    // Read wide, then filter: an existing summary carries the configured
    // memory visibility, and a read narrower than that would miss it and
    // derive a second summary beside the one already there.
    const existingCandidate =
      await this.context.entities.getEntity<SummaryEntity>({
        entityType: SUMMARY_ENTITY_TYPE,
        id: conversationId,
        visibilityScope: this.config.memoryVisibility,
      });
    const existing =
      existingCandidate?.visibility === this.config.memoryVisibility
        ? existingCandidate
        : null;

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

    const decision = await decideSummaryProjection(
      this.context.ai,
      source.messages,
      existing,
    );
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
      ...this.getParticipantsMetadata(source.messages),
      sourceHash: source.sourceHash,
      projectionVersion: this.config.projectionVersion,
    };

    const content = composeMemoryMarkdown(
      composeSummaryBody(projected.entries),
      metadata,
    );

    const now = new Date().toISOString();
    const entity: SummaryEntity = {
      id: conversationId,
      entityType: SUMMARY_ENTITY_TYPE,
      content,
      contentHash: computeContentHash(content),
      visibility: this.config.memoryVisibility,
      created: existing?.created ?? now,
      updated: now,
      metadata,
    };

    await this.context.entities.saveProcessed(entity);

    if (decision.decision === "update") {
      await this.deleteConversationMemory(conversationId);
    }
    await this.upsertConversationMemory(
      projected,
      metadata,
      now,
      source.messages,
    );

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
      projectionDecision: decision.decision,
    };
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
      getNewOrChangedMessages(messages, existing),
    );
    const existingEntries = parseSummaryBody(existing.content).entries;

    return {
      entries: this.compactEntries([...existingEntries, ...newMemory.entries]),
      decisions: newMemory.decisions,
      actionItems: newMemory.actionItems,
    };
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
    const visibilityScope = this.config.memoryVisibility;
    const [decisions, actionItems] = await Promise.all([
      this.context.entities.listEntities<DecisionEntity>({
        entityType: DECISION_ENTITY_TYPE,
        options: {
          filter: { metadata: { conversationId }, visibilityScope },
          limit,
        },
      }),
      this.context.entities.listEntities<ActionItemEntity>({
        entityType: ACTION_ITEM_ENTITY_TYPE,
        options: {
          filter: { metadata: { conversationId }, visibilityScope },
          limit,
        },
      }),
    ]);

    await Promise.all([
      ...decisions
        .filter((entity) => entity.visibility === visibilityScope)
        .map((entity) =>
          this.context.entities.delete(DECISION_ENTITY_TYPE, entity.id),
        ),
      ...actionItems
        .filter((entity) => entity.visibility === visibilityScope)
        .map((entity) =>
          this.context.entities.delete(ACTION_ITEM_ENTITY_TYPE, entity.id),
        ),
    ]);
  }

  private async upsertConversationMemory(
    projected: ProjectedConversationMemory,
    summaryMetadata: SummaryMetadata,
    now: string,
    messages: Message[],
  ): Promise<void> {
    const decisionEntities = projected.decisions.map((item) =>
      this.createDecisionEntity(item, summaryMetadata, now, messages),
    );
    const actionItemEntities = projected.actionItems.map((item) =>
      this.createActionItemEntity(item, summaryMetadata, now, messages),
    );

    await Promise.all(
      [...decisionEntities, ...actionItemEntities].map((entity) =>
        this.context.entities.saveProcessed(entity),
      ),
    );
  }

  private createDecisionEntity(
    item: ExtractedConversationMemoryItem,
    summaryMetadata: SummaryMetadata,
    now: string,
    messages: Message[],
  ): DecisionEntity {
    const itemActors = this.getActorsForMemoryItem(item, messages);
    const attributedActors = getActorsMentionedInText(item.text, itemActors);
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
      ...(attributedActors.length > 0
        ? { decidedBy: attributedActors, mentionedBy: attributedActors }
        : {}),
    };
    const title = this.titleForMemory("Decision", item.text);
    const content = composeMemoryMarkdown(
      composeMemoryBody(title, item.text),
      metadata,
    );

    return {
      id: this.memoryEntityId(summaryMetadata.conversationId, "decision", item),
      entityType: DECISION_ENTITY_TYPE,
      content,
      contentHash: computeContentHash(content),
      visibility: this.config.memoryVisibility,
      created: now,
      updated: now,
      metadata,
    };
  }

  private createActionItemEntity(
    item: ExtractedConversationMemoryItem,
    summaryMetadata: SummaryMetadata,
    now: string,
    messages: Message[],
  ): ActionItemEntity {
    const itemMessages = this.getMessagesForMemoryItem(item, messages);
    const itemActors = this.getMessageActors(itemMessages);
    const assignedActors = getActorsMentionedInText(item.text, itemActors);
    const requesterActors = this.getActionItemRequesterActors(
      item.text,
      itemMessages,
      assignedActors,
    );
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
      ...(assignedActors.length > 0
        ? {
            assignedTo: assignedActors.map((actor) => ({
              identity: actor.identity,
              displayName: actor.displayName ?? actorRefKey(actor.identity),
            })),
          }
        : {}),
      ...(requesterActors.length > 0 ? { requestedBy: requesterActors } : {}),
    };
    const title = this.titleForMemory("Action item", item.text);
    const content = composeMemoryMarkdown(
      composeMemoryBody(title, item.text),
      metadata,
    );

    return {
      id: this.memoryEntityId(
        summaryMetadata.conversationId,
        "action-item",
        item,
      ),
      entityType: ACTION_ITEM_ENTITY_TYPE,
      content,
      contentHash: computeContentHash(content),
      visibility: this.config.memoryVisibility,
      created: now,
      updated: now,
      metadata,
    };
  }

  private getParticipantsMetadata(messages: Message[]): {
    participants?: SummaryParticipant[];
  } {
    const participants = this.getParticipants(messages);
    return participants.length > 0 ? { participants } : {};
  }

  private getParticipants(messages: Message[]): SummaryParticipant[] {
    const participants = new Map<string, SummaryParticipant>();

    for (const actor of this.getMessageActors(messages)) {
      const key = this.actorIdentityKey(actor);
      const existing = participants.get(key);
      if (existing) {
        if (!existing.roles.includes(actor.role)) {
          existing.roles.push(actor.role);
        }
        if (!existing.displayName && actor.displayName) {
          existing.displayName = actor.displayName;
        }
        continue;
      }

      participants.set(key, {
        identity: actor.identity,
        ...(actor.displayName ? { displayName: actor.displayName } : {}),
        roles: [actor.role],
      });
    }

    return Array.from(participants.values());
  }

  private getActorsForMemoryItem(
    item: ExtractedConversationMemoryItem,
    messages: Message[],
  ): ConversationMessageActor[] {
    return this.getMessageActors(this.getMessagesForMemoryItem(item, messages));
  }

  private getMessagesForMemoryItem(
    item: ExtractedConversationMemoryItem,
    messages: Message[],
  ): Message[] {
    return messages.filter(
      (message) =>
        message.timestamp >= item.timeRange.start &&
        message.timestamp <= item.timeRange.end,
    );
  }

  private getMessageActors(messages: Message[]): ConversationMessageActor[] {
    return messages.flatMap((message) => {
      const parsed = conversationMessageMetadataSchema.safeParse(
        message.metadata,
      );
      return parsed.success && parsed.data.actor ? [parsed.data.actor] : [];
    });
  }

  private getActionItemRequesterActors(
    text: string,
    messages: Message[],
    assignedActors: MemoryActorReference[],
  ): MemoryActorReference[] {
    const delegatedRequesters = this.getDelegatedRequestActors(
      messages,
      assignedActors,
    );
    if (delegatedRequesters.length > 0) {
      return delegatedRequesters;
    }

    return this.getFirstPersonCommitmentActors(text, messages);
  }

  private getDelegatedRequestActors(
    messages: Message[],
    assignedActors: MemoryActorReference[],
  ): MemoryActorReference[] {
    if (assignedActors.length === 0) return [];

    const assignedKeys = new Set(
      assignedActors.map((actor) => this.actorIdentityKey(actor)),
    );
    const requesters = new Map<string, MemoryActorReference>();

    for (const message of messages) {
      if (message.role !== "user") continue;
      if (!this.isDelegatedRequestMessage(message.content)) continue;
      if (!this.textMentionsAnyMemoryActor(message.content, assignedActors)) {
        continue;
      }

      const actor = this.getMessageActors([message])[0];
      if (!actor) continue;
      const key = this.actorIdentityKey(actor);
      if (assignedKeys.has(key) || requesters.has(key)) continue;

      requesters.set(key, {
        identity: actor.identity,
        ...(actor.displayName ? { displayName: actor.displayName } : {}),
      });
    }

    return Array.from(requesters.values());
  }

  private getFirstPersonCommitmentActors(
    text: string,
    messages: Message[],
  ): MemoryActorReference[] {
    const mentionedActors = getActorsMentionedInText(
      text,
      this.getMessageActors(messages),
    );
    const mentionedActorKeys = new Set(
      mentionedActors.map((actor) => this.actorIdentityKey(actor)),
    );
    const committedActorKeys = new Set<string>();

    for (const message of messages) {
      if (message.role !== "user") continue;
      if (
        !/\b(i'll|i will|i can|i'm going to|i am going to)\b/i.test(
          message.content,
        )
      ) {
        continue;
      }
      const actor = this.getMessageActors([message])[0];
      if (actor && mentionedActorKeys.has(this.actorIdentityKey(actor))) {
        committedActorKeys.add(this.actorIdentityKey(actor));
      }
    }

    return mentionedActors.filter((actor) =>
      committedActorKeys.has(this.actorIdentityKey(actor)),
    );
  }

  private isDelegatedRequestMessage(content: string): boolean {
    return /\b(please|can you|could you|will you|would you|needs to|need you to|owns?|owner|assigned|assigning|take|handle)\b/i.test(
      content,
    );
  }

  private textMentionsAnyMemoryActor(
    text: string,
    actors: MemoryActorReference[],
  ): boolean {
    const normalizedText = normalizeForAttribution(text);
    return actors.some((actor) => {
      const labels = [actor.displayName, actorRefKey(actor.identity)]
        .filter((label): label is string => Boolean(label?.trim()))
        .map((label) => normalizeForAttribution(label));
      return labels.some((label) => normalizedText.includes(label));
    });
  }

  private actorIdentityKey(actor: {
    identity: ConversationMessageActor["identity"];
  }): string {
    return actorRefKey(actor.identity);
  }

  private memoryEntityId(
    conversationId: string,
    type: "decision" | "action-item",
    item: ExtractedConversationMemoryItem,
  ): string {
    const identity = JSON.stringify({
      text: normalizeForAttribution(item.text),
      start: item.timeRange.start,
      end: item.timeRange.end,
    });
    return `${conversationId}:${type}:${computeContentHash(identity).slice(0, 16)}`;
  }

  private titleForMemory(prefix: string, text: string): string {
    const normalized = text.replace(/\s+/g, " ").trim();
    return `${prefix}: ${truncateText(normalized, 80)}`;
  }

  private getSpaceId(metadata: SummaryMetadata): string {
    return getConversationSpaceId(metadata);
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

/** Derive and persist one conversation's complete memory state. */
export function deriveConversationMemory(
  context: SummaryProjectionContext,
  logger: LoggerContract,
  config: SummaryConfig,
  conversationId: string,
  extractionTemplateName: string = SUMMARY_AI_TEMPLATE_NAME,
): Promise<ProjectSummaryResult> {
  return new SummaryDerivation(
    context,
    logger,
    config,
    extractionTemplateName,
  ).projectConversation(conversationId);
}
