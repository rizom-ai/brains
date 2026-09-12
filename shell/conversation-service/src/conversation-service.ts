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
import {
  and,
  eq,
  ne,
  desc,
  asc,
  sql,
  count,
  gt,
  or,
  exists,
  inArray,
  type SQL,
} from "drizzle-orm";
import { z } from "@brains/utils/zod";
import {
  liveGuestConversation,
  expiredGuestConversation,
  conversationSqlNow,
} from "./guest-retention";

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
    if (guest && personId)
      throw new Error("Guest conversation cannot have an authenticated owner");
    const requestedOwnership = guestConversationOwnershipSchema.safeParse(
      metadata.guest,
    );
    if (guest && !requestedOwnership.success) {
      throw new Error("Guest ownership required");
    }
    const now = new Date().toISOString();

    // Check if conversation already exists for this sessionId
    const existing = await this.findConversation(sessionId);

    if (existing) {
      if (guest || existing.interfaceType === guestInterfaceType) {
        if (existing.interfaceType !== interfaceType)
          throw new Error("Conversation scope mismatch");
        const ownership = guestConversationOwnershipSchema.safeParse(
          coerceConversationMetadata(existing.metadata)["guest"],
        );
        if (
          !ownership.success ||
          !requestedOwnership.success ||
          JSON.stringify(ownership.data) !==
            JSON.stringify(requestedOwnership.data)
        ) {
          throw new Error("Guest ownership cannot be changed");
        }
        // Resolving a guest locator is not activity and must not renew retention.
        if (!(await this.getConversation(sessionId)))
          throw new Error("Guest conversation unavailable");
        return sessionId;
      }
      // Update last active time and return existing sessionId
      await this.db
        .update(conversations)
        .set({ lastActive: now, updated: now })
        .where(eq(conversations.id, sessionId));

      this.logger.debug("Resumed existing conversation", {
        conversationId: sessionId,
        interfaceType,
      });

      return sessionId;
    }

    // Create new conversation using sessionId as the ID
    const newConversation: NewConversation = {
      id: sessionId, // Use sessionId as the conversation ID
      sessionId,
      interfaceType,
      channelId,
      personId: personId ?? null,
      started: now,
      lastActive: now,
      created: now,
      updated: now,
      metadata: JSON.stringify(metadata),
    };

    await this.db.insert(conversations).values({
      ...newConversation,
      ...(guest
        ? {
            started: conversationSqlNow,
            lastActive: conversationSqlNow,
            created: conversationSqlNow,
            updated: conversationSqlNow,
          }
        : {}),
    });

    // Guest transcripts never enter general lifecycle hooks or memory tracking.
    if (guest) return sessionId;

    // Initialize summary tracking
    const tracking: NewSummaryTracking = {
      conversationId: sessionId,
      messagesSinceSummary: 0,
      updated: now,
    };
    await this.db.insert(summaryTracking).values(tracking);

    this.logger.debug("Started new conversation", {
      conversationId: sessionId,
      sessionId,
      interfaceType,
    });

    // Emit event for plugins
    await this.messageBus.send({
      type: CONVERSATION_STARTED_CHANNEL,
      payload: {
        conversationId: sessionId,
        sessionId,
        interfaceType,
        timestamp: now,
      },
      sender: "conversation-service",
      broadcast: true,
    });

    return sessionId;
  }

  /**
   * Add a message to a conversation
   */
  async addMessage(request: AddConversationMessageRequest): Promise<void> {
    const { conversationId, role, content, metadata } = request;
    const conversation = await this.getConversation(conversationId);
    if (!conversation) throw new Error("Conversation unavailable");
    const guest = conversation.interfaceType === guestInterfaceType;
    const now = new Date().toISOString();
    const messageId = createId(12);

    const newMessage: NewMessage = {
      id: messageId,
      conversationId,
      role,
      content,
      timestamp: now,
      metadata: metadata ? JSON.stringify(metadata) : null,
    };

    if (guest) {
      // Existence/scope and insertion are one SQL operation, not a read/write race.
      // A concurrent deletion either prevents this insert or cascades the row.
      try {
        await this.db.transaction(async (tx) => {
          const inserted = await tx
            .insert(messages)
            .select(
              sql`
            SELECT ${messageId}, ${conversationId}, ${role}, ${content}, ${conversationSqlNow}, ${newMessage.metadata ?? null}
            FROM ${conversations} WHERE ${this.accessCondition(conversation)}
          `,
            )
            .returning({ id: messages.id });
          if (inserted.length !== 1)
            throw new Error("Conversation unavailable");
          const updated = await tx
            .update(conversations)
            .set({
              lastActive: conversationSqlNow,
              updated: conversationSqlNow,
            })
            .where(this.accessCondition(conversation))
            .returning({ id: conversations.id });
          if (updated.length !== 1) throw new Error("Conversation unavailable");
        });
      } catch {
        // SQL errors can contain bound transcript text. Never expose or log them.
        throw new Error("Guest conversation write unavailable");
      }
      return;
    } else {
      await this.db.insert(messages).values(newMessage);
    }

    // Update conversation last active time
    await this.db
      .update(conversations)
      .set({ lastActive: now, updated: now })
      .where(eq(conversations.id, conversationId));

    // Update summary tracking
    await this.db
      .update(summaryTracking)
      .set({
        messagesSinceSummary: sql`${summaryTracking.messagesSinceSummary} + 1`,
        lastMessageId: messageId,
        updated: now,
      })
      .where(eq(summaryTracking.conversationId, conversationId));

    this.logger.debug("Added message to conversation", {
      conversationId,
      role,
      messageId,
    });

    // Emit event for plugins (non-blocking)
    await this.messageBus.send({
      type: CONVERSATION_MESSAGE_ADDED_CHANNEL,
      payload: {
        conversationId,
        messageId,
        role,
        content,
        metadata,
        timestamp: now,
      },
      sender: "conversation-service",
      broadcast: true,
    });

    // Check if digest should be broadcast
    await this.checkAndBroadcastDigest(conversationId, now);
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
      ne(conversations.interfaceType, guestInterfaceType),
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
    const existing = await this.getConversation(request.conversationId);
    if (!existing) return false;
    if (
      existing.interfaceType === guestInterfaceType &&
      "guest" in request.metadata
    ) {
      throw new Error("Guest ownership cannot be changed");
    }

    const now = new Date().toISOString();
    const metadata = {
      ...coerceConversationMetadata(existing.metadata),
      ...request.metadata,
    };

    const write = Promise.resolve().then(() =>
      this.db
        .update(conversations)
        .set({ metadata: JSON.stringify(metadata), updated: now })
        .where(this.accessCondition(existing))
        .returning({ id: conversations.id }),
    );
    // Guest metadata can contain private text. Convert failures to a safe error,
    // without retaining the original SQL exception or its bound parameters.
    const changed =
      existing.interfaceType === guestInterfaceType
        ? await write.catch(() => null)
        : await write;
    if (!changed) throw new Error("Guest conversation write unavailable");
    if (changed.length !== 1) return false;

    if (existing.interfaceType !== guestInterfaceType)
      this.logger.debug("Updated conversation metadata", {
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
