import { CONVERSATION_CHANNELS } from "./conversation-channels";
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
} from "./types";
import {
  CONVERSATION_MESSAGE_ADDED_CHANNEL,
  CONVERSATION_STARTED_CHANNEL,
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
import { and, eq, desc, asc, sql, count, gt, or } from "drizzle-orm";

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
    const outcome = await this.db.transaction(async (tx) => {
      const [existing] = await tx
        .select()
        .from(conversations)
        .where(eq(conversations.id, sessionId))
        .limit(1);
      const timestamp = nextConversationTimestamp(existing?.updated);

      if (existing) {
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
      await tx.insert(conversations).values(newConversation);
      await tx.insert(summaryTracking).values(tracking);
      return { created: true, timestamp };
    });

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
    const timestamp = await this.db.transaction(async (tx) => {
      const [conversation] = await tx
        .select({ updated: conversations.updated })
        .from(conversations)
        .where(eq(conversations.id, conversationId))
        .limit(1);
      if (!conversation) {
        throw new Error(`Conversation not found: ${conversationId}`);
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
      return nextTimestamp;
    });

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

    if (range) {
      // Get specific range (1-based indexing)
      const offset = range.start - 1; // Convert to 0-based
      const messageLimit = range.end - range.start + 1;

      const result = await this.db
        .select()
        .from(messages)
        .where(eq(messages.conversationId, conversationId))
        .orderBy(asc(messages.timestamp))
        .limit(messageLimit)
        .offset(offset);

      return result;
    } else {
      // Get most recent N messages (default behavior)
      const result = await this.db
        .select()
        .from(messages)
        .where(eq(messages.conversationId, conversationId))
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
    const result = await this.db
      .select()
      .from(conversations)
      .where(eq(conversations.id, conversationId))
      .limit(1);

    return result[0] ?? null;
  }

  /**
   * List conversations, newest active first.
   */
  async listConversations(
    options: ListConversationsOptions = {},
  ): Promise<Conversation[]> {
    const {
      limit = 100,
      updatedAfter,
      interfaceType,
      sessionId,
      channelId,
      personId,
    } = options;
    const filters = [
      updatedAfter ? gt(conversations.updated, updatedAfter) : undefined,
      interfaceType
        ? eq(conversations.interfaceType, interfaceType)
        : undefined,
      sessionId ? eq(conversations.sessionId, sessionId) : undefined,
      channelId ? eq(conversations.channelId, channelId) : undefined,
      personId ? eq(conversations.personId, personId) : undefined,
    ].filter((filter) => filter !== undefined);

    const query = this.db
      .select()
      .from(conversations)
      .orderBy(desc(conversations.lastActive))
      .limit(limit);

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
        sessionId
          ? sql`lower(${messages.content}) LIKE ${queryLower} AND ${conversations.sessionId} = ${sessionId}`
          : sql`lower(${messages.content}) LIKE ${queryLower}`,
      )
      .orderBy(desc(conversations.lastActive));

    return results.map((r) => r.conversation);
  }

  async countMessages(conversationId: string): Promise<number> {
    const [result] = await this.db
      .select({ count: count() })
      .from(messages)
      .where(eq(messages.conversationId, conversationId));
    return Number(result?.count ?? 0);
  }

  async updateConversationMetadata(
    request: UpdateConversationMetadataRequest,
  ): Promise<boolean> {
    const updated = await this.db.transaction(async (tx) => {
      const [existing] = await tx
        .select()
        .from(conversations)
        .where(eq(conversations.id, request.conversationId))
        .limit(1);
      if (!existing) return false;

      const timestamp = nextConversationTimestamp(existing.updated);
      const metadata = {
        ...coerceConversationMetadata(existing.metadata),
        ...request.metadata,
      };
      await tx
        .update(conversations)
        .set({ metadata: JSON.stringify(metadata), updated: timestamp })
        .where(eq(conversations.id, request.conversationId));
      return true;
    });
    if (!updated) return false;

    this.logger.debug("Updated conversation metadata", {
      conversationId: request.conversationId,
    });
    return true;
  }

  async deleteConversation(conversationId: string): Promise<boolean> {
    const existing = await this.getConversation(conversationId);
    if (!existing) return false;

    await this.db
      .delete(conversations)
      .where(eq(conversations.id, conversationId));

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
