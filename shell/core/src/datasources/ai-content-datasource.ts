import type { DataSource } from "@brains/datasource";
import type { IAIService } from "@brains/ai-service";
import type { IEntityService, SearchResult } from "@brains/entity-service";
import type { TemplateRegistry } from "@brains/templates";
import type { IdentityBody } from "@brains/identity-service";
import { z } from "@brains/utils";

/**
 * Zod schema for GenerationContext validation
 */
export const GenerationContextSchema = z.object({
  prompt: z.string().optional(),
  conversationHistory: z.string().optional(),
  data: z.record(z.string(), z.unknown()).optional(),
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
    private readonly entityService: IEntityService,
    private readonly templateRegistry: TemplateRegistry,
    private readonly getIdentity: () => IdentityBody,
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

    // Build system prompt with identity
    const systemPrompt = this.buildSystemPrompt(template.basePrompt);

    // Generate content using AI service with entity-informed context and identity
    const result = await this.aiService.generateObject(
      systemPrompt,
      enhancedPrompt,
      template.schema,
    );

    // Validate and return typed result
    return schema.parse(result.object);
  }

  /**
   * Build system prompt with identity prepended
   */
  private buildSystemPrompt(templateBasePrompt: string): string {
    const identity = this.getIdentity();

    // Build identity system prompt (identity is always available - from entity or default)
    const identityPrompt = [
      `You are ${identity.role}.`,
      identity.purpose ? `\nYour purpose: ${identity.purpose}` : "",
      identity.values.length > 0
        ? `\nYour guiding values: ${identity.values.join(", ")}`
        : "",
      "\n",
    ]
      .filter(Boolean)
      .join("");

    // Prepend identity to template base prompt
    return identityPrompt + templateBasePrompt;
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
