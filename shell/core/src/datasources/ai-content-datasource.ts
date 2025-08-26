import type { DataSource } from "@brains/datasource";
import type { IAIService } from "@brains/ai-service";
import type { IConversationService, Message } from "@brains/conversation-service";
import type { EntityService, SearchResult } from "@brains/entity-service";
import type { Logger } from "@brains/utils";
import type { TemplateRegistry } from "@brains/templates";
import { z } from "zod";

/**
 * Zod schema for GenerationContext validation
 */
export const GenerationContextSchema = z.object({
  prompt: z.string().optional(),
  data: z.record(z.unknown()).optional(),
  conversationId: z.string().optional(),
  templateName: z.string(),
});

/**
 * Generation context for AI content generation
 */
export type GenerationContext = z.infer<typeof GenerationContextSchema>;

/**
 * AI Content DataSource
 * 
 * Handles AI-powered content generation using templates and context.
 * Replaces the Provider pattern for content generation.
 */
export class AIContentDataSource implements DataSource {
  readonly id = "ai-content";
  readonly name = "AI Content Generator";
  readonly description = "Generates content using AI based on templates and prompts";

  constructor(
    private readonly aiService: IAIService,
    private readonly conversationService: IConversationService,
    private readonly entityService: EntityService,
    private readonly templateRegistry: TemplateRegistry,
    private readonly logger: Logger,
  ) {}

  /**
   * Generate content using AI based on the request context
   * This replicates the logic from ContentService.generateContent()
   */
  async generate<T>(request: unknown, schema: z.ZodSchema<T>): Promise<T> {
    // Validate the request using our internal schema
    const context = GenerationContextSchema.parse(request);

    // Get the template from registry
    const template = this.templateRegistry.get(context.templateName);
    if (!template) {
      throw new Error(`Template not found: ${context.templateName}`);
    }

    // Check if template supports AI generation
    if (!template.basePrompt) {
      throw new Error(
        `Template ${context.templateName} must have basePrompt for content generation`
      );
    }

    // Query relevant entities to provide context for generation
    const searchTerms = [template.basePrompt, context.prompt]
      .filter(Boolean)
      .join(" ");
    const relevantEntities = searchTerms
      ? await this.entityService.search(searchTerms, { limit: 5 })
      : [];

    // Build enhanced prompt with template, user context, entity context, and conversation context
    const enhancedPrompt = await this.buildPrompt(
      template,
      context,
      relevantEntities,
    );

    // Generate content using AI service with entity-informed context
    const result = await this.aiService.generateObject(
      template.basePrompt,
      enhancedPrompt,
      template.schema,
    );

    // Validate and return typed result
    return schema.parse(result.object);
  }

  /**
   * Build enhanced prompt with context from template, user context, entities, and conversation
   */
  private async buildPrompt(
    template: any,
    context: GenerationContext,
    relevantEntities: SearchResult[] = [],
  ): Promise<string> {
    let prompt = template.basePrompt;

    // Add conversation context if not a system conversation
    if (
      context.conversationId &&
      context.conversationId !== "system" &&
      context.conversationId !== "default"
    ) {
      try {
        const messages = await this.conversationService.getMessages(
          context.conversationId,
          { limit: 20 }, // Get last 20 messages for context
        );

        const workingMemory = this.formatMessagesAsContext(messages);
        if (workingMemory) {
          prompt += `\n\nRecent conversation context:\n${workingMemory}`;
        }
      } catch (error) {
        // Log error but don't fail generation if conversation context unavailable
        this.logger.debug("Failed to get conversation context", {
          error,
          conversationId: context.conversationId,
        });
      }
    }

    // Add entity context to inform the generation
    if (relevantEntities.length > 0) {
      const entityContext = relevantEntities
        .map(
          (result) =>
            `[${result.entity.entityType}] ${result.entity.id}: ${result.excerpt}`,
        )
        .join("\n");
      prompt += `\n\nRelevant context from your knowledge base:\n${entityContext}`;
    }

    // Add user context data if provided
    if (context.data) {
      prompt += `\n\nContext data:\n${JSON.stringify(context.data, null, 2)}`;
    }

    // Add additional instructions if provided
    if (context.prompt) {
      prompt += `\n\nAdditional instructions: ${context.prompt}`;
    }

    return prompt;
  }

  /**
   * Format messages as conversation context for AI prompts
   */
  private formatMessagesAsContext(messages: Message[]): string {
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