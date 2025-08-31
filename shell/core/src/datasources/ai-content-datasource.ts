import type { DataSource } from "@brains/datasource";
import type { IAIService } from "@brains/ai-service";
import type { EntityService, SearchResult } from "@brains/entity-service";
import type { TemplateRegistry } from "@brains/templates";
import { z } from "@brains/utils";

/**
 * Zod schema for GenerationContext validation
 */
export const GenerationContextSchema = z.object({
  prompt: z.string().optional(),
  conversationHistory: z.string().optional(),
  data: z.record(z.unknown()).optional(),
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
  readonly description =
    "Generates content using AI based on templates and prompts";

  constructor(
    private readonly aiService: IAIService,
    private readonly entityService: EntityService,
    private readonly templateRegistry: TemplateRegistry,
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
        `Template ${context.templateName} must have basePrompt for content generation`,
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
      { basePrompt: template.basePrompt },
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
    template: { basePrompt: string },
    context: GenerationContext,
    relevantEntities: SearchResult[] = [],
  ): Promise<string> {
    let prompt = template.basePrompt;

    // Add conversation history if provided
    if (context.conversationHistory) {
      prompt += `\n\nRecent conversation context:\n${context.conversationHistory}`;
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
}
