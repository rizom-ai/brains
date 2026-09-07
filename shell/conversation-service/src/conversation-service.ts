import { CONVERSATION_CHANNELS } from "./conversation-channels";
import {
  guestInterfaceType,
  guestConversationOwnershipSchema,
} from "@brains/contracts/chat";
import { applySqlitePragmas } from "@brains/db";
import { createConversationDatabase } from "./database";
import type { ConversationDB } from "./database";
import { coerceConversationMetadata } from "./metadata";
import type { Client } from "@libsql/client";
import type {
  IConversationService,
  ConversationServiceConfig,
  ConversationDbConfig,
  GetMessagesOptions,
  ListConversationsOptions,
  ConversationDigestPayload,
  StartConversationRequest,
  AddConversationMessageRequest,
  UpdateConversationMetadataRequest,
  ConversationChangeCursor,
  ConversationWithMessages,
  GetManyConversationsWithMessagesRequest,
} from "./types";
import {
  CONVERSATION_MESSAGE_ADDED_CHANNEL,
  CONVERSATION_STARTED_CHANNEL,
  getManyConversationsWithMessagesSchema,
} from "./types";
import type {
  Conversation,
  Message,
  NewConversation,
  NewMessage,
  NewSummaryTracking,
} from "./schema";
import { conversations, messages, summaryTracking } from "./schema";
import type { Logger } from "@brains/utils/logger";
import { createId } from "@brains/utils/id";
import type { MessageBus } from "@brains/messaging-service";
import {
  and,
  eq,
  desc,
  asc,
  sql,
  count,
  gt,
  or,
  inArray,
  lte,
  ne,
  exists,
  type SQL,
} from "drizzle-orm";
import { z } from "@brains/utils/zod";
import { liveGuestConversation, expiredGuestConversation, conversationSqlNow } from "./guest-retention";

function nextConversationTimestamp(previous?: string): string {
  const now = Date.now();
  const previousTime = previous ? Date.parse(previous) : Number.NaN;
  return new Date(
    Number.isFinite(previousTime) ? Math.max(now, previousTime + 1) : now,
  ).toISOString();
}

/**
 * Conversation Service - Core infrastructure for storing and retrieving conversations
 */
export class ConversationService implements IConversationService {
  private readonly db: ConversationDB;
  private readonly logger: Logger;
  private readonly messageBus: MessageBus;
  private readonly config: ConversationServiceConfig;
  private dbClient: Client | null = null;
  private dbUrl: string | null = null;
  private pragmaInitialization: Promise<void> | null = null;

  constructor(
    db: ConversationDB,
    logger: Logger,
    messageBus: MessageBus,
    config: ConversationServiceConfig = {},
  ) {
    this.db = db;
    this.logger = logger;
    this.messageBus = messageBus;
    this.config = {
      digestTriggerInterval: 5,
      digestWindowSize: 10,
      ...config,
    };
  }

  /**
   * Settle non-fatal database readiness work before the shell becomes ready.
   *
   * `busy_timeout` is per-connection, so it has to be re-applied on every
   * runtime connection — migrations setting it is not enough.
   */
  public initialize(): Promise<void> {
    this.pragmaInitialization ??= this.applyPragmas();
    return this.pragmaInitialization;
  }

  private async applyPragmas(): Promise<void> {
    const client = this.dbClient;
    const url = this.dbUrl;
    if (!client || url === null) return;

    try {
      await applySqlitePragmas(client, url);
    } catch (error) {
      this.logger.warn(
        "Failed to enable conversation database pragmas (non-fatal)",
        error,
      );
    }
  }

  /** The owned database client, when this instance opened its own connection. */
  public getDatabaseClient(): Client {
    if (!this.dbClient) {
      throw new Error("ConversationService does not own a database client");
    }
    return this.dbClient;
  }

  /**
   * Close the underlying database connection.
   */
  public close(): void {
    this.dbClient?.close();
  }

  /** Create a fresh instance around a caller-owned database handle. */
  public static createFresh(
    db: ConversationDB,
    logger: Logger,
    messageBus: MessageBus,
    config?: ConversationServiceConfig,
  ): ConversationService {
    return new ConversationService(db, logger, messageBus, config);
  }

  /** Create a fresh instance that owns the database opened from config. */
  public static createFreshFromConfig(
    logger: Logger,
    messageBus: MessageBus,
    dbConfig: ConversationDbConfig,
    config?: ConversationServiceConfig,
  ): ConversationService {
    const { db, client, url } = createConversationDatabase(dbConfig);
    const instance = new ConversationService(db, logger, messageBus, config);
    instance.dbClient = client;
    instance.dbUrl = url;
    return instance;
  }

  /**
   * Start a new conversation session (idempotent - returns existing or creates new)
   */
  async startConversation(request: StartConversationRequest): Promise<string> {
    const { sessionId, interfaceType, channelId, personId, metadata } = request;
    const guest = interfaceType === guestInterfaceType;
    if (guest && personId) throw new Error("Guest conversation cannot have an authenticated owner");
    const requestedOwnership = guestConversationOwnershipSchema.safeParse(metadata.guest);
    if (guest && !requestedOwnership.success) throw new Error("Guest ownership required");
    const outcome = await this.db.transaction(async (tx) => {
      const [existing] = await tx
        .select()
        .from(conversations)
        .where(eq(conversations.id, sessionId))
        .limit(1);
      const timestamp = nextConversationTimestamp(existing?.updated);

      if (existing) {
        if (guest || existing.interfaceType === guestInterfaceType) {
          if (existing.interfaceType !== interfaceType) throw new Error("Conversation scope mismatch");
          const ownership = guestConversationOwnershipSchema.safeParse(coerceConversationMetadata(existing.metadata)["guest"]);
          if (!ownership.success || !requestedOwnership.success || JSON.stringify(ownership.data) !== JSON.stringify(requestedOwnership.data)) {
            throw new Error("Guest ownership cannot be changed");
          }
          const [live] = await tx.select({ id: conversations.id }).from(conversations).where(this.accessCondition(existing)).limit(1);
          if (!live) throw new Error("Guest conversation unavailable");
          // Looking up a locator must not extend its retention.
          return { created: false, timestamp };
        }
        await tx
          .update(conversations)
          .set({ lastActive: timestamp, updated: timestamp })
          .where(eq(conversations.id, sessionId));
        return { created: false, timestamp };
      }

      const newConversation: NewConversation = {
        id: sessionId,
        sessionId,
        interfaceType,
        channelId,
        personId: personId ?? null,
        started: timestamp,
        lastActive: timestamp,
        created: timestamp,
        updated: timestamp,
        metadata: JSON.stringify(metadata),
      };
      const tracking: NewSummaryTracking = {
        conversationId: sessionId,
        messagesSinceSummary: 0,
        updated: timestamp,
      };
      await tx.insert(conversations).values({
        ...newConversation,
        ...(guest ? { started: conversationSqlNow, lastActive: conversationSqlNow, created: conversationSqlNow, updated: conversationSqlNow } : {}),
      });
      if (!guest) await tx.insert(summaryTracking).values(tracking);
      return { created: true, timestamp };
    });

    // Guest transcripts never enter general lifecycle hooks or memory tracking.
    if (guest) return sessionId;
    this.logger.debug(
      outcome.created
        ? "Started new conversation"
        : "Resumed existing conversation",
      { conversationId: sessionId, sessionId, interfaceType },
    );

    if (outcome.created) {
      await this.messageBus.send({
        type: CONVERSATION_STARTED_CHANNEL,
        payload: {
          conversationId: sessionId,
          sessionId,
          interfaceType,
          timestamp: outcome.timestamp,
        },
        sender: "conversation-service",
        broadcast: true,
      });
    }

    return sessionId;
  }

  /**
   * Add a message to a conversation
   */
  async addMessage(request: AddConversationMessageRequest): Promise<void> {
    const { conversationId, role, content, metadata } = request;
    const messageId = createId(12);
    const outcome = await this.db.transaction(async (tx) => {
      const [conversation] = await tx
        .select()
        .from(conversations)
        .where(eq(conversations.id, conversationId))
        .limit(1);
      if (!conversation) {
        throw new Error(`Conversation not found: ${conversationId}`);
      }

      if (conversation.interfaceType === guestInterfaceType) {
        if (!guestConversationOwnershipSchema.safeParse(coerceConversationMetadata(conversation.metadata)["guest"]).success) {
          throw new Error("Conversation unavailable");
        }
        try {
          const inserted = await tx.insert(messages).select(sql`
            SELECT ${messageId}, ${conversationId}, ${role}, ${content}, ${conversationSqlNow}, ${metadata ? JSON.stringify(metadata) : null}
            FROM ${conversations} WHERE ${this.accessCondition(conversation)}
          `).returning({ id: messages.id });
          if (inserted.length !== 1) throw new Error("Conversation unavailable");
          const updated = await tx.update(conversations).set({ lastActive: conversationSqlNow, updated: conversationSqlNow }).where(this.accessCondition(conversation)).returning({ id: conversations.id });
          if (updated.length !== 1) throw new Error("Conversation unavailable");
        } catch {
          // SQL errors can retain bound transcript text; never expose that cause.
          throw new Error("Guest conversation write unavailable");
        }
        return { guest: true, timestamp: conversation.updated };
      }
      const nextTimestamp = nextConversationTimestamp(conversation.updated);
      const newMessage: NewMessage = {
        id: messageId,
        conversationId,
        role,
        content,
        timestamp: nextTimestamp,
        metadata: metadata ? JSON.stringify(metadata) : null,
      };

      await tx.insert(messages).values(newMessage);
      await tx
        .update(conversations)
        .set({ lastActive: nextTimestamp, updated: nextTimestamp })
        .where(eq(conversations.id, conversationId));
      await tx
        .update(summaryTracking)
        .set({
          messagesSinceSummary: sql`${summaryTracking.messagesSinceSummary} + 1`,
          lastMessageId: messageId,
          updated: nextTimestamp,
        })
        .where(eq(summaryTracking.conversationId, conversationId));
      return { guest: false, timestamp: nextTimestamp };
    });
    if (outcome.guest) return;
    const timestamp = outcome.timestamp;

    this.logger.debug("Added message to conversation", {
      conversationId,
      role,
      messageId,
    });

    await this.messageBus.send({
      type: CONVERSATION_MESSAGE_ADDED_CHANNEL,
      payload: {
        conversationId,
        messageId,
        role,
        content,
        metadata,
        timestamp,
      },
      sender: "conversation-service",
      broadcast: true,
    });

    await this.checkAndBroadcastDigest(conversationId, timestamp);
  }

  /**
   * Get messages from a conversation
   */
  async getMessages(
    conversationId: string,
    options: GetMessagesOptions = {},
  ): Promise<Message[]> {
    const { limit = 20, range } = options;
    const conversation = await this.getConversation(conversationId);
    if (!conversation) return [];
    const condition = and(
      eq(messages.conversationId, conversationId),
      exists(
        this.db
          .select({ id: conversations.id })
          .from(conversations)
          .where(this.accessCondition(conversation)),
      ),
    );

    if (range) {
      // Get specific range (1-based indexing)
      const offset = range.start - 1; // Convert to 0-based
      const messageLimit = range.end - range.start + 1;

      const result = await this.db
        .select()
        .from(messages)
        .where(condition)
        .orderBy(asc(messages.timestamp))
        .limit(messageLimit)
        .offset(offset);

      return result;
    } else {
      // Get most recent N messages (default behavior)
      const result = await this.db
        .select()
        .from(messages)
        .where(condition)
        .orderBy(desc(messages.timestamp))
        .limit(limit);

      // Return in chronological order
      return result.reverse();
    }
  }

  /**
   * Get conversation details
   */
  async getConversation(conversationId: string): Promise<Conversation | null> {
    const [conversation] = await this.db
      .select()
      .from(conversations)
      .where(
        and(
          eq(conversations.id, conversationId),
          or(
            ne(conversations.interfaceType, guestInterfaceType),
            liveGuestConversation(),
          ),
        ),
      )
      .limit(1);
    if (
      conversation?.interfaceType === guestInterfaceType &&
      !guestConversationOwnershipSchema.safeParse(
        coerceConversationMetadata(conversation.metadata)["guest"],
      ).success
    )
      return null;
    return conversation ?? null;
  }

  private accessCondition(conversation: Conversation): SQL {
    return sql`${conversations.id} = ${conversation.id} AND ${conversations.interfaceType} = ${conversation.interfaceType}
      ${
        conversation.interfaceType === guestInterfaceType
          ? sql`AND ${conversations.metadata} = ${conversation.metadata} AND ${liveGuestConversation()}`
          : sql``
      }`;
  }

  private async findConversation(
    conversationId: string,
  ): Promise<Conversation | null> {
    const result = await this.db
      .select()
      .from(conversations)
      .where(eq(conversations.id, conversationId))
      .limit(1);

    return result[0] ?? null;
  }

  async getManyWithMessages(
    request: GetManyConversationsWithMessagesRequest,
  ): Promise<readonly ConversationWithMessages[]> {
    const parsed = getManyConversationsWithMessagesSchema.parse(request);
    const ids = [...new Set(parsed.ids)];
    if (ids.length === 0) return [];

    const selectedConversations = await this.db
      .select()
      .from(conversations)
      .where(inArray(conversations.id, ids));
    const rankedMessages = this.db
      .select({
        id: messages.id,
        conversationId: messages.conversationId,
        role: messages.role,
        content: messages.content,
        timestamp: messages.timestamp,
        metadata: messages.metadata,
        rank: sql<number>`row_number() over (partition by ${messages.conversationId} order by ${messages.timestamp} desc, ${messages.id} desc)`.as(
          "message_rank",
        ),
      })
      .from(messages)
      .where(inArray(messages.conversationId, ids))
      .as("ranked_messages");
    const selectedMessages = await this.db
      .select({
        id: rankedMessages.id,
        conversationId: rankedMessages.conversationId,
        role: rankedMessages.role,
        content: rankedMessages.content,
        timestamp: rankedMessages.timestamp,
        metadata: rankedMessages.metadata,
      })
      .from(rankedMessages)
      .where(lte(rankedMessages.rank, parsed.messageLimit))
      .orderBy(
        asc(rankedMessages.conversationId),
        asc(rankedMessages.timestamp),
        asc(rankedMessages.id),
      );

    const messagesByConversation = new Map<string, Message[]>();
    for (const message of selectedMessages) {
      const grouped = messagesByConversation.get(message.conversationId) ?? [];
      grouped.push(message);
      messagesByConversation.set(message.conversationId, grouped);
    }
    const conversationsById = new Map(
      selectedConversations.map((conversation) => [
        conversation.id,
        conversation,
      ]),
    );
    return ids.flatMap((id): ConversationWithMessages[] => {
      const conversation = conversationsById.get(id);
      return conversation
        ? [
            {
              conversation,
              messages: messagesByConversation.get(id) ?? [],
            },
          ]
        : [];
    });
  }

  /**
   * List conversations, newest active first.
   */
  async listConversations(
    options: ListConversationsOptions = {},
  ): Promise<Conversation[]> {
    const {
      limit = 100,
      offset = 0,
      query: search,
      archived,
      updatedAfter,
      interfaceType,
      sessionId,
      channelId,
      personId,
    } = options;
    const filters = [
      ne(conversations.interfaceType, guestInterfaceType),
      updatedAfter ? gt(conversations.updated, updatedAfter) : undefined,
      interfaceType
        ? eq(conversations.interfaceType, interfaceType)
        : undefined,
      sessionId ? eq(conversations.sessionId, sessionId) : undefined,
      channelId ? eq(conversations.channelId, channelId) : undefined,
      personId ? eq(conversations.personId, personId) : undefined,
      archived === undefined
        ? undefined
        : archived
          ? sql`json_type(${conversations.metadata}, '$.archivedAt') = 'text'`
          : sql`json_type(${conversations.metadata}, '$.archivedAt') IS NOT 'text'`,
      search?.trim()
        ? sql`(
        instr(lower(coalesce(json_extract(${conversations.metadata}, '$.title'), '')), ${search.trim().toLowerCase()}) > 0
        OR EXISTS (SELECT 1 FROM ${messages} WHERE ${messages.conversationId} = ${conversations.id}
          AND instr(lower(${messages.content}), ${search.trim().toLowerCase()}) > 0)
      )`
        : undefined,
    ].filter((filter) => filter !== undefined);

    const query = this.db
      .select()
      .from(conversations)
      .orderBy(desc(conversations.lastActive), desc(conversations.id))
      .limit(limit)
      .offset(offset);

    if (filters.length === 0) return query;
    return query.where(and(...filters));
  }

  async listConversationsUpdatedSince(input: {
    after: ConversationChangeCursor | null;
    limit: number;
  }): Promise<Conversation[]> {
    const query = this.db
      .select()
      .from(conversations)
      .orderBy(asc(conversations.updated), asc(conversations.id))
      .limit(input.limit);
    if (input.after === null) return query;

    return query.where(
      or(
        gt(conversations.updated, input.after.updated),
        and(
          eq(conversations.updated, input.after.updated),
          gt(conversations.id, input.after.id),
        ),
      ),
    );
  }

  async getConversationChangeHead(): Promise<ConversationChangeCursor | null> {
    const [head] = await this.db
      .select({ updated: conversations.updated, id: conversations.id })
      .from(conversations)
      .orderBy(desc(conversations.updated), desc(conversations.id))
      .limit(1);
    return head ?? null;
  }

  /**
   * Search conversations by content
   */
  async searchConversations(
    query: string,
    sessionId?: string,
  ): Promise<Conversation[]> {
    // Simple search through conversations that contain the query in their messages
    const queryLower = `%${query.toLowerCase()}%`;

    const results = await this.db
      .selectDistinct({ conversation: conversations })
      .from(conversations)
      .leftJoin(messages, eq(messages.conversationId, conversations.id))
      .where(
        and(
          ne(conversations.interfaceType, guestInterfaceType),
          sessionId
            ? sql`lower(${messages.content}) LIKE ${queryLower} AND ${conversations.sessionId} = ${sessionId}`
            : sql`lower(${messages.content}) LIKE ${queryLower}`,
        ),
      )
      .orderBy(desc(conversations.lastActive));

    return results.map((r) => r.conversation);
  }

  async countMessages(conversationId: string): Promise<number> {
    const conversation = await this.getConversation(conversationId);
    if (!conversation) return 0;
    const [result] = await this.db
      .select({ count: count() })
      .from(messages)
      .where(
        and(
          eq(messages.conversationId, conversationId),
          exists(
            this.db
              .select({ id: conversations.id })
              .from(conversations)
              .where(this.accessCondition(conversation)),
          ),
        ),
      );
    return Number(result?.count ?? 0);
  }

  async updateConversationMetadata(
    request: UpdateConversationMetadataRequest,
  ): Promise<boolean> {
    const outcome = await this.db.transaction(async (tx) => {
      const [existing] = await tx
        .select()
        .from(conversations)
        .where(eq(conversations.id, request.conversationId))
        .limit(1);
      if (!existing) return { updated: false, guest: false };
      const guest = existing.interfaceType === guestInterfaceType;
      if (guest && !guestConversationOwnershipSchema.safeParse(coerceConversationMetadata(existing.metadata)["guest"]).success) return { updated: false, guest };
      if (guest) {
        const [live] = await tx.select({ id: conversations.id }).from(conversations).where(this.accessCondition(existing)).limit(1);
        if (!live) return { updated: false, guest };
        if ("guest" in request.metadata) throw new Error("Guest ownership cannot be changed");
      }
      const timestamp = guest ? conversationSqlNow : nextConversationTimestamp(existing.updated);
      const metadata = {
        ...coerceConversationMetadata(existing.metadata),
        ...request.metadata,
      };
      try {
        const changed = await tx
          .update(conversations)
          .set({ metadata: JSON.stringify(metadata), updated: timestamp })
          .where(this.accessCondition(existing))
          .returning({ id: conversations.id });
        return { updated: changed.length === 1, guest };
      } catch (error) {
        // Guest metadata may contain private text in SQL parameters.
        if (guest) throw new Error("Guest conversation write unavailable");
        throw error;
      }
    });
    if (!outcome.updated) return false;

    if (!outcome.guest) this.logger.debug("Updated conversation metadata", {
      conversationId: request.conversationId,
    });
    return true;
  }

  /** Trusted maintenance only; no transcript enumeration, events or raw-ID logging. */
  async deleteExpiredGuestConversations(limit: number = 100): Promise<number> {
    z.number().int().min(1).max(1000).parse(limit);
    const expired = this.db
      .select({ id: conversations.id })
      .from(conversations)
      .where(
        and(
          eq(conversations.interfaceType, guestInterfaceType),
          expiredGuestConversation(),
        ),
      )
      .orderBy(asc(conversations.lastActive))
      .limit(limit);
    const removed = await this.db
      .delete(conversations)
      .where(inArray(conversations.id, expired))
      .returning({ id: conversations.id });
    return removed.length;
  }

  async deleteConversation(conversationId: string): Promise<boolean> {
    const existing = await this.findConversation(conversationId);
    if (!existing) return false;

    await this.db
      .delete(conversations)
      .where(eq(conversations.id, conversationId));

    if (existing.interfaceType !== guestInterfaceType)
      this.logger.debug("Deleted conversation", { conversationId });
    return true;
  }

  /**
   * Check if digest should be broadcast and do so if needed
   */
  private async checkAndBroadcastDigest(
    conversationId: string,
    timestamp: string,
  ): Promise<void> {
    const messageCount = await this.countMessages(conversationId);

    // Check if we should trigger a digest
    const triggerInterval = this.config.digestTriggerInterval ?? 10;
    if (messageCount > 0 && messageCount % triggerInterval === 0) {
      await this.broadcastDigest(conversationId, messageCount, timestamp);
    }
  }

  /**
   * Broadcast conversation digest with overlapping message window
   */
  private async broadcastDigest(
    conversationId: string,
    messageCount: number,
    timestamp: string,
  ): Promise<void> {
    const windowSize = this.config.digestWindowSize ?? 20;
    const windowStart = Math.max(1, messageCount - windowSize + 1);
    const windowEnd = messageCount;

    // Fetch the message window
    const windowMessages = await this.getMessages(conversationId, {
      range: { start: windowStart, end: windowEnd },
    });

    const digestPayload: ConversationDigestPayload = {
      conversationId,
      messageCount,
      messages: windowMessages,
      windowStart,
      windowEnd,
      windowSize: windowMessages.length,
      timestamp,
    };

    // Broadcast digest event
    await this.messageBus.send({
      type: CONVERSATION_CHANNELS.digest,
      payload: digestPayload,
      sender: "conversation-service",
      broadcast: true,
    });

    this.logger.debug("Broadcast conversation digest", {
      conversationId,
      messageCount,
      windowStart,
      windowEnd,
      windowSize: windowMessages.length,
    });
  }
}
