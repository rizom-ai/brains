import { createConversationDatabase } from "./database";
import type { ConversationDB, ConversationDbConfig } from "./database";
import type {
  IConversationService,
  ConversationServiceConfig,
  MessageRole,
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
import { MessageBus } from "@brains/messaging-service";
import { eq, desc, sql } from "drizzle-orm";

/**
 * Conversation Service - Core infrastructure for storing and retrieving conversations
 */
export class ConversationService implements IConversationService {
  private static instance: ConversationService | null = null;
  private readonly messageBus: MessageBus;

  constructor(
    private readonly db: ConversationDB,
    private readonly logger: Logger,
    private readonly config: ConversationServiceConfig = {},
  ) {
    this.messageBus = MessageBus.getInstance(logger);
  }

  /**
   * Get singleton instance
   */
  public static getInstance(
    logger: Logger,
    dbConfig: ConversationDbConfig,
    config?: ConversationServiceConfig,
  ): ConversationService {
    if (!ConversationService.instance) {
      // Create database internally
      const { db } = createConversationDatabase(dbConfig);
      ConversationService.instance = new ConversationService(
        db,
        logger,
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
    config?: ConversationServiceConfig,
  ): ConversationService {
    return new ConversationService(db, logger, config);
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
  }

  /**
   * Get messages from a conversation
   */
  async getMessages(conversationId: string, limit = 20): Promise<Message[]> {
    const result = await this.db
      .select()
      .from(messages)
      .where(eq(messages.conversationId, conversationId))
      .orderBy(desc(messages.timestamp))
      .limit(limit);

    // Return in chronological order
    return result.reverse();
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
   * Get working memory (recent messages formatted as context)
   */
  async getWorkingMemory(conversationId: string): Promise<string> {
    const messages = await this.getMessages(
      conversationId,
      this.config.workingMemorySize ?? 20,
    );

    if (messages.length === 0) {
      return "";
    }

    // Format messages as a conversation transcript
    return messages
      .map((m) => {
        const role = m.role.charAt(0).toUpperCase() + m.role.slice(1);
        return `${role}: ${m.content}`;
      })
      .join("\n\n");
  }
}
