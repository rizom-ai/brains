import type { DataSource } from "@brains/datasource";
import type { IAIService } from "@brains/ai-service";
import type { IEntityService, SearchResult } from "@brains/entity-service";
import type { TemplateRegistry } from "@brains/templates";
import { z, EntityUrlGenerator } from "@brains/utils";

export const GenerationContextSchema = z.object({
  prompt: z.string().optional(),
  conversationHistory: z.string().optional(),
  data: z.record(z.string(), z.unknown()).optional(),
  templateName: z.string(),
});

export type GenerationContext = z.infer<typeof GenerationContextSchema>;

export class AIContentDataSource implements DataSource {
  readonly id = "ai-content";
  readonly name = "AI Content Generator";
  readonly description =
    "Generates content using AI based on templates and prompts";

  constructor(
    private readonly aiService: IAIService,
    private readonly entityService: IEntityService,
    private readonly templateRegistry: TemplateRegistry,
    private readonly getIdentityContent: () => string,
    private readonly getProfileContent: () => string,
    private readonly siteBaseUrl?: string,
  ) {}

  async generate<T>(request: unknown, schema: z.ZodSchema<T>): Promise<T> {
    const context = GenerationContextSchema.parse(request);

    const template = this.templateRegistry.get(context.templateName);
    if (!template) {
      throw new Error(`Template not found: ${context.templateName}`);
    }

    if (!template.basePrompt) {
      throw new Error(
        `Template ${context.templateName} must have basePrompt for content generation`,
      );
    }

    const searchTerms = [template.basePrompt, context.prompt]
      .filter(Boolean)
      .join(" ");

    const weightMap = this.entityService.getWeightMap();
    const hasWeights = Object.keys(weightMap).length > 0;

    const relevantEntities = searchTerms
      ? await this.entityService.search(searchTerms, {
          limit: 5,
          ...(hasWeights && { weight: weightMap }),
        })
      : [];

    const enhancedPrompt = await this.buildPrompt(
      { basePrompt: template.basePrompt },
      context,
      relevantEntities,
    );

    const systemPrompt = this.buildSystemPrompt(template.basePrompt);

    const result = await this.aiService.generateObject(
      systemPrompt,
      enhancedPrompt,
      template.schema,
    );

    return schema.parse(result.object);
  }

  private buildSystemPrompt(templateBasePrompt: string): string {
    return [
      "# Your Identity",
      this.getIdentityContent(),
      "",
      "# About the Person You Represent",
      this.getProfileContent(),
      "",
      "# Instructions",
      templateBasePrompt,
    ].join("\n");
  }

  private async buildPrompt(
    template: { basePrompt: string },
    context: GenerationContext,
    relevantEntities: SearchResult[] = [],
  ): Promise<string> {
    let prompt = template.basePrompt;

    if (context.conversationHistory) {
      prompt += `\n\nRecent conversation context:\n${context.conversationHistory}`;
    }

    if (relevantEntities.length > 0) {
      const urlGenerator = EntityUrlGenerator.getInstance();
      const entityContext = relevantEntities
        .map((result) => {
          const { entity, excerpt } = result;
          const entityType = entity.entityType;
          const slugSchema = z.object({ slug: z.string() });
          const parsed = slugSchema.safeParse(entity.metadata);
          const slug = parsed.success ? parsed.data.slug : entity.id;

          if (this.siteBaseUrl && urlGenerator.hasRoute(entityType)) {
            const path = urlGenerator.generateUrl(entityType, slug);
            const url = `https://${this.siteBaseUrl}${path}`;
            return `[${entityType}] ${entity.id}: ${excerpt} (${url})`;
          }

          return `[${entityType}] ${entity.id}: ${excerpt}`;
        })
        .join("\n");
      prompt += `\n\nRelevant context from your knowledge base:\n${entityContext}`;
    }

    if (context.data) {
      prompt += `\n\nContext data:\n${JSON.stringify(context.data, null, 2)}`;
    }

    if (context.prompt) {
      prompt += `\n\nAdditional instructions: ${context.prompt}`;
    }

    return prompt;
  }
}
