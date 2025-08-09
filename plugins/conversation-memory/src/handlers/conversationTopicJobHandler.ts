import type { JobHandler } from "@brains/job-queue";
import type { ServicePluginContext } from "@brains/plugins";
import type { ProgressReporter } from "@brains/utils";
import { z } from "zod";
import type { ConversationDB } from "../db";
import {
  messages,
  summaryTracking,
  conversations,
} from "../schema/conversations";
import { eq, sql, and, gt } from "drizzle-orm";
import {
  conversationMetadataSchema,
  type ConversationMemoryConfig,
} from "../types";
import {
  type ConversationTopic,
  type ConversationTopicOutput,
} from "../schemas/topic";
import { createId } from "@brains/plugins";
import { conversationTopicTemplate } from "../templates/conversation-topic-template";

/**
 * Schema for conversation topic job data
 */
const conversationTopicJobSchema = z.object({
  conversationId: z.string(),
});

export type ConversationTopicJobData = z.infer<
  typeof conversationTopicJobSchema
>;

/**
 * Job handler for creating conversation topics
 * Processes messages in sliding windows and creates topical summaries
 */
export class ConversationTopicJobHandler
  implements JobHandler<string, ConversationTopicJobData, void>
{
  public readonly type = "conversation-topic";

  constructor(
    private readonly db: ConversationDB,
    private readonly context: ServicePluginContext,
    private readonly config: ConversationMemoryConfig,
  ) {}

  /**
   * Validate and parse job data
   */
  validateAndParse(data: unknown): ConversationTopicJobData | null {
    try {
      return conversationTopicJobSchema.parse(data);
    } catch {
      return null;
    }
  }

  /**
   * Process the job
   */
  async process(
    data: ConversationTopicJobData,
    _jobId: string,
    _progressReporter: ProgressReporter,
  ): Promise<void> {
    const { conversationId } = data;

    this.context.logger.info(
      "Processing conversation for topic summarization",
      {
        conversationId,
      },
    );

    // Get conversation metadata for context
    const [conversation] = await this.db
      .select()
      .from(conversations)
      .where(eq(conversations.id, conversationId))
      .limit(1);

    if (!conversation) {
      throw new Error(`Conversation ${conversationId} not found`);
    }

    // Get tracking info to determine window
    const [tracking] = await this.db
      .select()
      .from(summaryTracking)
      .where(eq(summaryTracking.conversationId, conversationId))
      .limit(1);

    if (!tracking) {
      throw new Error(`No tracking found for conversation ${conversationId}`);
    }

    // Calculate sliding window
    const batchSize = this.config.summarization?.batchSize ?? 20;
    const overlapPercentage =
      this.config.summarization?.overlapPercentage ?? 0.25;
    const overlapCount = Math.floor(batchSize * overlapPercentage);

    // Get messages for the window
    const messageBatch = await this.getMessageWindow(
      conversationId,
      tracking.lastMessageId,
      batchSize,
      overlapCount,
    );

    if (messageBatch.length === 0) {
      this.context.logger.info("No new messages to process", {
        conversationId,
      });
      return;
    }

    // Process messages into topics
    await this.processMessages(conversationId, messageBatch, conversation);

    // Update tracking with the last message processed
    const lastMessage = messageBatch[messageBatch.length - 1];
    if (lastMessage) {
      await this.updateTracking(conversationId, lastMessage.id);
    }
  }

  /**
   * Get messages for the sliding window
   */
  private async getMessageWindow(
    conversationId: string,
    lastMessageId: string | null,
    batchSize: number,
    overlapCount: number,
  ): Promise<Array<typeof messages.$inferSelect>> {
    if (!lastMessageId) {
      // First time processing - start from beginning
      return this.db
        .select()
        .from(messages)
        .where(eq(messages.conversationId, conversationId))
        .orderBy(messages.timestamp)
        .limit(batchSize);
    }

    // Get the timestamp of the last processed message
    const [lastMsg] = await this.db
      .select({ timestamp: messages.timestamp })
      .from(messages)
      .where(eq(messages.id, lastMessageId))
      .limit(1);

    if (!lastMsg) {
      // Last message not found, start from beginning
      return this.db
        .select()
        .from(messages)
        .where(eq(messages.conversationId, conversationId))
        .orderBy(messages.timestamp)
        .limit(batchSize);
    }

    // Get messages starting from before the last processed (for overlap)
    const overlapMessages = await this.db
      .select()
      .from(messages)
      .where(
        and(
          eq(messages.conversationId, conversationId),
          gt(messages.timestamp, lastMsg.timestamp),
        ),
      )
      .orderBy(messages.timestamp)
      .limit(batchSize - overlapCount);

    // Get some messages before for context
    const contextMessages = await this.db
      .select()
      .from(messages)
      .where(
        and(
          eq(messages.conversationId, conversationId),
          sql`${messages.timestamp} <= ${lastMsg.timestamp}`,
        ),
      )
      .orderBy(sql`${messages.timestamp} DESC`)
      .limit(overlapCount);

    return [...contextMessages.reverse(), ...overlapMessages];
  }

  /**
   * Process a batch of messages to create/update topics
   */
  private async processMessages(
    conversationId: string,
    messageBatch: Array<typeof messages.$inferSelect>,
    conversation: typeof conversations.$inferSelect,
  ): Promise<void> {
    // Group messages into content for summarization
    const messageContent = messageBatch
      .map((msg) => `${msg.role}: ${msg.content}`)
      .join("\n\n");

    // Check if we have substantial content
    if (messageContent.length < 100) {
      this.context.logger.debug("Insufficient content for topic creation", {
        conversationId,
        contentLength: messageContent.length,
      });
      return;
    }

    // Parse conversation metadata if it exists
    const defaultMetadata = conversationMetadataSchema.parse({});
    let metadata = defaultMetadata;

    if (conversation.metadata) {
      try {
        const parsed = JSON.parse(conversation.metadata);
        const result = conversationMetadataSchema.safeParse(parsed);
        if (result.success) {
          metadata = result.data;
        } else {
          this.context.logger.warn("Invalid conversation metadata schema", {
            error: result.error,
          });
        }
      } catch (error) {
        this.context.logger.warn("Failed to parse conversation metadata JSON", {
          error,
        });
      }
    }

    // Prepare context for the template
    const templateContext = {
      messages: messageContent,
      user: metadata.user ?? "unknown",
      channel: conversation.sessionId,
      interface: conversation.interfaceType,
      messageCount: messageBatch.length,
      targetLength: this.config.summarization?.targetLength ?? 400,
      maxLength: this.config.summarization?.maxLength ?? 1000,
    };

    // Generate the topic summary using the content generator
    const prompt = Object.entries(templateContext).reduce(
      (acc, [key, value]) => {
        return acc.replace(new RegExp(`{{${key}}}`, "g"), String(value));
      },
      conversationTopicTemplate.basePrompt ?? "",
    );

    const topicOutput =
      await this.context.generateContent<ConversationTopicOutput>({
        prompt,
        templateName: "conversation-memory:conversation-topic",
        data: templateContext,
      });

    // Format the content using the template's formatter
    const formattedContent = this.context.formatContent(
      "conversation-memory:conversation-topic",
      topicOutput,
    );

    // Create topic entity
    const topic: ConversationTopic = {
      id: createId(),
      entityType: "conversation-topic",
      content: formattedContent,
      metadata: {
        title: topicOutput.title,
        messageCount: messageBatch.length,
        lastUpdated: new Date().toISOString(),
      },
      created: new Date().toISOString(),
      updated: new Date().toISOString(),
    };

    // Find or create similar topic
    await this.findOrCreateTopic(topic);

    this.context.logger.info("Created conversation topic", {
      conversationId,
      topicId: topic.id,
      messageCount: messageBatch.length,
      title: topicOutput.title,
    });
  }

  /**
   * Find similar topic or create new one
   */
  private async findOrCreateTopic(topic: ConversationTopic): Promise<void> {
    const similarityThreshold =
      this.config.summarization?.similarityThreshold ?? 0.7;

    // Search for similar topics using semantic search
    // The entity service will use embeddings to find similar content
    const searchResults =
      await this.context.entityService.search<ConversationTopic>(
        topic.content,
        {
          types: ["conversation-topic"],
          limit: 10,
        },
      );

    // Check if any results are above similarity threshold
    let merged = false;
    for (const result of searchResults) {
      if (result.score && result.score >= similarityThreshold) {
        // Found a similar topic - merge with it
        const existingTopic = result.entity;

        this.context.logger.info("Merging with existing topic", {
          existingTopicId: existingTopic.id,
          existingTitle: existingTopic.metadata.title,
          newTitle: topic.metadata.title,
          similarity: result.score,
        });

        // Merge the content using AI
        await this.mergeTopics(existingTopic, topic);
        merged = true;
        break;
      }
    }

    if (!merged) {
      // No similar topic found - create new one
      await this.context.entityService.createEntity(topic);

      this.context.logger.info("Created new topic", {
        topicId: topic.id,
        title: topic.metadata.title,
      });
    }
  }

  /**
   * Merge new content into an existing topic
   */
  private async mergeTopics(
    existingTopic: ConversationTopic,
    newTopic: ConversationTopic,
  ): Promise<void> {
    // Generate merged content using a merge template
    // For now, we'll append the new content
    // TODO: Create a proper merge template that intelligently combines content
    const mergedContent = `${existingTopic.content}\n\n## Additional Context\n${newTopic.content}`;

    // Update the existing topic
    const updatedTopic = {
      ...existingTopic,
      content: mergedContent,
      metadata: {
        ...existingTopic.metadata,
        messageCount:
          (existingTopic.metadata.messageCount ?? 0) +
          newTopic.metadata.messageCount,
        lastUpdated: new Date().toISOString(),
      },
      updated: new Date().toISOString(),
    };

    await this.context.entityService.updateEntity(updatedTopic);
  }

  /**
   * Update tracking after processing
   */
  private async updateTracking(
    conversationId: string,
    lastMessageId: string,
  ): Promise<void> {
    const now = new Date().toISOString();

    await this.db
      .update(summaryTracking)
      .set({
        lastSummarizedAt: now,
        lastMessageId,
        messagesSinceSummary: 0,
        updated: now,
      })
      .where(eq(summaryTracking.conversationId, conversationId));
  }
}
