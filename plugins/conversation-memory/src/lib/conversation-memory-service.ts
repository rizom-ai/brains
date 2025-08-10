import type { ConversationDB } from "../db";
import {
  conversationSummaryMetadataSchema,
  type IConversationMemoryService,
  type ConversationMemoryConfig,
  type SearchResult,
  type ConversationContext,
} from "../types";
import type {
  Conversation,
  Message,
  NewConversation,
  NewMessage,
  NewSummaryTracking,
} from "../schema/conversations";
import {
  conversations,
  messages,
  summaryTracking,
} from "../schema/conversations";
import type { ServicePluginContext } from "@brains/plugins";
import { createId } from "@brains/plugins";
import { eq, desc, sql } from "drizzle-orm";

/**
 * Service implementation for conversation memory
 */
export class ConversationMemoryService implements IConversationMemoryService {
  constructor(
    private readonly db: ConversationDB,
    private readonly context: ServicePluginContext,
    private readonly config: ConversationMemoryConfig,
  ) {}

  /**
   * Start a new conversation session
   */
  async startConversation(
    sessionId: string,
    interfaceType: string,
  ): Promise<string> {
    const now = new Date().toISOString();
    const conversationId = createId(12);

    const newConversation: NewConversation = {
      id: conversationId,
      sessionId,
      interfaceType,
      started: now,
      lastActive: now,
      created: now,
      updated: now,
      metadata: JSON.stringify({}),
    };

    await this.db.insert(conversations).values(newConversation);

    // Initialize summary tracking
    const tracking: NewSummaryTracking = {
      conversationId,
      messagesSinceSummary: 0,
      updated: now,
    };
    await this.db.insert(summaryTracking).values(tracking);

    this.context.logger.debug("Started new conversation", {
      conversationId,
      sessionId,
      interfaceType,
    });

    return conversationId;
  }

  /**
   * Add a message to a conversation
   */
  async addMessage(
    conversationId: string,
    role: "user" | "assistant" | "system",
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

    this.context.logger.debug("Added message to conversation", {
      conversationId,
      role,
      messageId,
    });

    // Auto-check for summarization if enabled
    if (this.config.summarization?.enableAutomatic !== false) {
      const needsSummarization = await this.checkSummarizationNeeded(
        conversationId,
      );
      if (needsSummarization) {
        this.context.logger.info(
          "Auto-triggering topical summarization for conversation",
          {
            conversationId,
          },
        );
        // Queue async summarization - non-blocking
        await this.createSummary(conversationId).catch((error) => {
          this.context.logger.error(
            "Failed to create automatic summary",
            error,
          );
        });
      }
    }
  }

  /**
   * Get recent messages from a conversation
   */
  async getRecentMessages(
    conversationId: string,
    limit = 20,
  ): Promise<Message[]> {
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
   * Check if summarization is needed
   */
  async checkSummarizationNeeded(conversationId: string): Promise<boolean> {
    if (!this.config.summarization?.enableAutomatic) {
      return false;
    }

    const [tracking] = await this.db
      .select()
      .from(summaryTracking)
      .where(eq(summaryTracking.conversationId, conversationId))
      .limit(1);

    if (!tracking) {
      return false;
    }

    const { minMessages = 20, minTimeMinutes = 60 } = this.config.summarization;

    // Check message count
    if ((tracking.messagesSinceSummary ?? 0) >= minMessages) {
      return true;
    }

    // Check time since last summary
    if (tracking.lastSummarizedAt) {
      const timeSinceSummary =
        Date.now() - new Date(tracking.lastSummarizedAt).getTime();
      const minutesSinceSummary = timeSinceSummary / (1000 * 60);
      if (minutesSinceSummary >= minTimeMinutes) {
        return true;
      }
    }

    return false;
  }

  /**
   * Queue a summary job for the conversation
   */
  async createSummary(conversationId: string): Promise<void> {
    const conversation = await this.getConversation(conversationId);
    if (!conversation) {
      throw new Error(`Conversation ${conversationId} not found`);
    }

    // Queue a summarization job
    this.context.logger.info("Queueing conversation summary job", {
      conversationId,
      sessionId: conversation.sessionId,
    });

    await this.context.enqueueJob("conversation-topic", { conversationId });
  }

  /**
   * Search conversations (via summary entities)
   */
  async searchConversations(
    sessionId: string,
    query: string,
  ): Promise<SearchResult[]> {
    // Search summary entities
    const results = await this.context.entityService.search(query, {
      types: ["conversation-topic"],
      limit: 10,
    });

    // Filter by session and format results
    return results
      .filter((result) => {
        const parsed = conversationSummaryMetadataSchema.safeParse(
          result.entity.metadata,
        );
        return parsed.success && parsed.data.sessionId === sessionId;
      })
      .map((result) => {
        const parsed = conversationSummaryMetadataSchema.safeParse(
          result.entity.metadata,
        );
        return {
          conversationId: parsed.success ? parsed.data.conversationId : "",
          excerpt: result.excerpt,
          timestamp: result.entity.updated,
          relevance: result.score,
        };
      });
  }

  /**
   * Get conversation context
   */
  async getConversationContext(
    conversationId: string,
  ): Promise<ConversationContext> {
    const conversation = await this.getConversation(conversationId);
    if (!conversation) {
      throw new Error(`Conversation ${conversationId} not found`);
    }

    // Count messages
    const [result] = await this.db
      .select({ count: sql<number>`count(*)` })
      .from(messages)
      .where(eq(messages.conversationId, conversationId));

    const count = result?.count ?? 0;

    return {
      conversationId,
      sessionId: conversation.sessionId,
      messageCount: Number(count),
      started: conversation.started,
      lastActive: conversation.lastActive,
      // Topics and entities can be added later when we have proper extraction
    };
  }
}
