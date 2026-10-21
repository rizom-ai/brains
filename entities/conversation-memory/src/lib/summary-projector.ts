import {
  ACTION_ITEM_ENTITY_TYPE,
  ActionItemAdapter,
  actionItemSchema,
  type ActionItemEntity,
  type ActionItemMetadata,
  type MemoryActorReference,
  actionItemBodyHash,
  isBoardOwned,
} from "@brains/action-items";
import { actorRefKey } from "@brains/contracts";
import {
  conversationMessageMetadataSchema,
  type ConversationMessageActor,
  type EntityPluginContext,
  type Message,
} from "@brains/plugins";
import { type Logger } from "@brains/utils/logger";
import { pLimit } from "@brains/utils/p-limit";
import { truncateText } from "@brains/utils/string-utils";
import { computeContentHash } from "@brains/utils/hash";
import { DECISION_ENTITY_TYPE, SUMMARY_ENTITY_TYPE } from "./constants";
import { DecisionAdapter } from "../adapters/conversation-memory-adapters";
import { SummaryAdapter } from "../adapters/summary-adapter";
import {
  decisionSchema,
  type DecisionEntity,
  type DecisionMetadata,
} from "../schemas/conversation-memory";
import {
  summaryProjectionDecisionSchema,
  type SummaryProjectionDecision,
} from "../schemas/extraction";
import {
  summarySchema,
  type SummaryEntity,
  type SummaryEntry,
  type SummaryMetadata,
  type SummaryParticipant,
} from "../schemas/summary";
import type { SummaryConfig } from "../schemas/summary-config";
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

/** The text hash that ends a projected memory id; stable when extraction order shifts. */
function textHashOf(id: string): string {
  return id.slice(id.lastIndexOf(":") + 1);
}

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

/** An actor as a card names them: an id, its aliases, and a name when known. */
function flatPerson(actor: MemoryActorReference): {
  id: string;
  name?: string;
  aliases?: string[];
} {
  const id = actorRefKey(actor.identity);
  const aliases = (actor.identityAliases ?? [])
    .map(actorRefKey)
    .filter((alias) => alias !== id);
  return {
    id,
    ...(actor.displayName ? { name: actor.displayName } : {}),
    ...(aliases.length > 0 ? { aliases } : {}),
  };
}

/** A summary's metadata with the conversation it belongs to, which is its id. */
type ProjectedConversation = SummaryMetadata & { conversationId: string };

export class SummaryProjector {
  private readonly context: EntityPluginContext;
  private readonly logger: Logger;
  private readonly config: SummaryConfig;
  private readonly adapter = new SummaryAdapter();

  /** A summary's entry count is its body's, not a stored copy. */
  private entryCountOf(summary: SummaryEntity): number {
    return this.adapter.parseBody(summary.content).entries.length;
  }
  private readonly decisionAdapter = new DecisionAdapter();
  private readonly actionItemAdapter = new ActionItemAdapter();
  private readonly sourceReader: SummarySourceReader;
  private readonly extractor: SummaryExtractor;

  constructor(
    context: EntityPluginContext,
    logger: Logger,
    config: SummaryConfig,
  ) {
    this.context = context;
    this.logger = logger;
    this.config = config;
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

    const existingCandidate = await this.context.entityService.getEntity(
      {
        entityType: SUMMARY_ENTITY_TYPE,
        id: conversationId,
        visibilityScope: this.config.memoryVisibility,
      },
      summarySchema,
    );
    const existing =
      existingCandidate?.visibility === this.config.memoryVisibility
        ? existingCandidate
        : null;

    if (existing?.metadata.sourceHash === source.sourceHash) {
      return {
        conversationId,
        created: false,
        skipped: true,
        entryCount: this.entryCountOf(existing),
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
        entryCount: existing ? this.entryCountOf(existing) : 0,
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
        entryCount: existing ? this.entryCountOf(existing) : 0,
        messageCount: source.messages.length,
        sourceHash: source.sourceHash,
        skipReason: "ai-skip",
      };
    }

    const timeRange = this.getTimeRange(source.messages);
    const metadata: SummaryMetadata = {
      channelId: source.conversation.channelId,
      ...(source.conversation.channelName
        ? { channelName: source.conversation.channelName }
        : {}),
      interfaceType: source.conversation.interfaceType,
      ...(timeRange ? { timeRange } : {}),
      messageCount: source.messages.length,
      ...this.getParticipantsMetadata(source.messages),
      sourceHash: source.sourceHash,
    };

    const content = this.adapter.composeContent(projected.entries, metadata);

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

    await this.context.entityService.upsertEntity({ entity });

    const boardOwned =
      decision.decision === "update"
        ? await this.replaceConversationMemory(conversationId)
        : (await this.listConversationActionItems(conversationId)).filter(
            isBoardOwned,
          );
    await this.upsertConversationMemory(
      projected,
      { ...metadata, conversationId },
      now,
      source.messages,
      boardOwned,
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

  private async listConversationActionItems(
    conversationId: string,
  ): Promise<ActionItemEntity[]> {
    const visibilityScope = this.config.memoryVisibility;
    const actionItems = await this.context.entityService.listEntities(
      {
        entityType: ACTION_ITEM_ENTITY_TYPE,
        options: {
          filter: { metadata: { conversationId }, visibilityScope },
          limit: this.config.maxEntries * 4,
        },
      },
      actionItemSchema,
    );
    return actionItems.filter(
      (entity) => entity.visibility === visibilityScope,
    );
  }

  /**
   * Replace a conversation's projected memory: decisions and untouched action
   * items go; action items the board owns stay. Returns those it kept.
   */
  private async replaceConversationMemory(
    conversationId: string,
  ): Promise<ActionItemEntity[]> {
    const limit = this.config.maxEntries * 4;
    const visibilityScope = this.config.memoryVisibility;
    const [decisions, listedActionItems] = await Promise.all([
      this.context.entityService.listEntities(
        {
          entityType: DECISION_ENTITY_TYPE,
          options: {
            filter: { metadata: { conversationId }, visibilityScope },
            limit,
          },
        },
        decisionSchema,
      ),
      this.listConversationActionItems(conversationId),
    ]);
    const boardOwned = listedActionItems.filter(isBoardOwned);
    const actionItems = listedActionItems.filter(
      (entity) => !isBoardOwned(entity),
    );

    await Promise.all([
      ...decisions
        .filter((entity) => entity.visibility === visibilityScope)
        .map((entity) =>
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
    return boardOwned;
  }

  private async upsertConversationMemory(
    projected: ProjectedConversationMemory,
    summaryMetadata: ProjectedConversation,
    now: string,
    messages: Message[],
    boardOwned: ActionItemEntity[],
  ): Promise<void> {
    const decisionEntities = projected.decisions.map((item, index) =>
      this.createDecisionEntity(item, summaryMetadata, index, now, messages),
    );
    // A re-extracted item the board already owns keeps its card, wherever it
    // now falls in the extraction order.
    const ownedTexts = new Set(
      boardOwned.map((entity) => textHashOf(entity.id)),
    );
    const actionItemEntities = projected.actionItems
      .map((item, index) =>
        this.createActionItemEntity(
          item,
          summaryMetadata,
          index,
          now,
          messages,
        ),
      )
      .filter((entity) => !ownedTexts.has(textHashOf(entity.id)));

    await Promise.all(
      [...decisionEntities, ...actionItemEntities].map((entity) =>
        this.context.entityService.upsertEntity({ entity }),
      ),
    );
  }

  private createDecisionEntity(
    item: ExtractedConversationMemoryItem,
    summaryMetadata: ProjectedConversation,
    index: number,
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
      timeRange: item.timeRange,
      status: "active",
      ...(attributedActors.length > 0
        ? { decidedBy: attributedActors, mentionedBy: attributedActors }
        : {}),
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
      visibility: this.config.memoryVisibility,
      created: now,
      updated: now,
      metadata,
    };
  }

  private createActionItemEntity(
    item: ExtractedConversationMemoryItem,
    summaryMetadata: ProjectedConversation,
    index: number,
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
      capturedAt: item.timeRange.end,
      status: "open",
      ...(assignedActors.length > 0
        ? {
            assignedTo: assignedActors.map((actor) => ({
              ...flatPerson(actor),
              name: actor.displayName ?? actorRefKey(actor.identity),
            })),
          }
        : {}),
      ...(requesterActors.length > 0
        ? { requestedBy: requesterActors.map(flatPerson) }
        : {}),
    };
    const title = this.titleForMemory("Action item", item.text);
    const projectedBodyHash = actionItemBodyHash(
      this.actionItemAdapter.composeContent(title, item.text, metadata),
    );
    const projectedMetadata: ActionItemMetadata = {
      ...metadata,
      projectedBodyHash,
    };
    const content = this.actionItemAdapter.composeContent(
      title,
      item.text,
      projectedMetadata,
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
      visibility: this.config.memoryVisibility,
      created: now,
      updated: now,
      metadata: projectedMetadata,
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
    index: number,
    text: string,
  ): string {
    return `${conversationId}:${type}:${index + 1}:${computeContentHash(text).slice(0, 12)}`;
  }

  private titleForMemory(prefix: string, text: string): string {
    const normalized = text.replace(/\s+/g, " ").trim();
    return `${prefix}: ${truncateText(normalized, 80)}`;
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
