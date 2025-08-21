import { createConversationDatabase } from "./database";
import type { ConversationDB, ConversationDbConfig } from "./database";
import type {
  IConversationService,
  ConversationServiceConfig,
  MessageRole,
  GetMessagesOptions,
  ConversationDigestPayload,
} from "./types";
import type {
  Conversation,
  Message,
  NewConversation,
  NewMessage,
  NewSummaryTracking,
} from "./schema";
import { conversations, messages, summaryTracking } from "./schema";
import type { Logger } from "@brains/utils";
import { createId } from "@brains/utils";
import type { MessageBus } from "@brains/messaging-service";
import { eq, desc, asc, sql, count } from "drizzle-orm";

/**
 * Conversation Service - Core infrastructure for storing and retrieving conversations
 */
export class ConversationService implements IConversationService {
  private static instance: ConversationService | null = null;
  private readonly messageBus: MessageBus;
  private readonly config: ConversationServiceConfig;

  constructor(
    private readonly db: ConversationDB,
    private readonly logger: Logger,
    messageBus: MessageBus,
    config: ConversationServiceConfig = {},
  ) {
    this.messageBus = messageBus;
    this.config = {
      digestTriggerInterval: 10,
      digestWindowSize: 20,
      ...config,
    };
  }

  /**
   * Get singleton instance
   */
  public static getInstance(
    logger: Logger,
    messageBus: MessageBus,
    dbConfig: ConversationDbConfig,
    config?: ConversationServiceConfig,
  ): ConversationService {
    if (!ConversationService.instance) {
      // Create database internally
      const { db } = createConversationDatabase(dbConfig);
      ConversationService.instance = new ConversationService(
        db,
        logger,
        messageBus,
        config,
      );
    }
    return ConversationService.instance;
  }

  /**
   * Reset singleton instance (for testing)
   */
  public static resetInstance(): void {
    ConversationService.instance = null;
  }

  /**
   * Create fresh instance (for testing)
   */
  public static createFresh(
    db: ConversationDB,
    logger: Logger,
    messageBus: MessageBus,
    config?: ConversationServiceConfig,
  ): ConversationService {
    return new ConversationService(db, logger, messageBus, config);
  }

  /**
   * Start a new conversation session (idempotent - returns existing or creates new)
   */
  async startConversation(
    sessionId: string,
    interfaceType: string,
    channelId: string,
  ): Promise<string> {
    const now = new Date().toISOString();

    // Check if conversation already exists for this sessionId
    const existing = await this.getConversation(sessionId);

    if (existing) {
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
      started: now,
      lastActive: now,
      created: now,
      updated: now,
      metadata: JSON.stringify({}),
    };

    await this.db.insert(conversations).values(newConversation);

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
    await this.messageBus.send(
      "conversation:started",
      {
        conversationId: sessionId,
        sessionId,
        interfaceType,
        timestamp: now,
      },
      "conversation-service",
      undefined,
      undefined,
      true, // broadcast
    );

    return sessionId;
  }

  /**
   * Add a message to a conversation
   */
  async addMessage(
    conversationId: string,
    role: MessageRole,
    content: string,
    metadata?: Record<string, unknown>,
  ): Promise<void> {
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

    await this.db.insert(messages).values(newMessage);

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
    await this.messageBus.send(
      "conversation:messageAdded",
      {
        conversationId,
        messageId,
        role,
        content,
        metadata,
        timestamp: now,
      },
      "conversation-service",
      undefined,
      undefined,
      true, // broadcast
    );

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

  /**
   * Check if digest should be broadcast and do so if needed
   */
  private async checkAndBroadcastDigest(
    conversationId: string,
    timestamp: string,
  ): Promise<void> {
    // Get current message count for this conversation
    const [result] = await this.db
      .select({ count: count() })
      .from(messages)
      .where(eq(messages.conversationId, conversationId));

    const messageCount = Number(result?.count ?? 0);

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
    await this.messageBus.send(
      "conversation:digest",
      digestPayload,
      "conversation-service",
      undefined,
      undefined,
      true, // broadcast
    );

    this.logger.info("Broadcast conversation digest", {
      conversationId,
      messageCount,
      windowStart,
      windowEnd,
      windowSize: windowMessages.length,
    });
  }
}
