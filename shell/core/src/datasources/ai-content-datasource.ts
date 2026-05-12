import type { DataSource } from "@brains/entity-service";
import type { IAIService } from "@brains/ai-service";
import type { IEntityService, SearchResult } from "@brains/entity-service";
import type { TemplateRegistry } from "@brains/templates";
import { EntityUrlGenerator } from "@brains/site-composition";
import { z } from "@brains/utils";
import { resolvePrompt } from "@brains/plugins";

export const GenerationContextSchema = z.object({
  prompt: z.string().optional(),
  conversationHistory: z.string().optional(),
  data: z.record(z.string(), z.unknown()).optional(),
  templateName: z.string(),
});

export type GenerationContext = z.infer<typeof GenerationContextSchema>;

const entitySlugSchema = z.object({ slug: z.string() });

function normalizeSiteBaseUrl(
  siteBaseUrl: string | undefined,
): string | undefined {
  if (!siteBaseUrl) return undefined;
  return siteBaseUrl.replace(/^https?:\/\//, "").replace(/\/$/, "");
}

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
    siteBaseUrl?: string,
  ) {
    this.siteBaseUrl = normalizeSiteBaseUrl(siteBaseUrl);
  }

  private readonly siteBaseUrl: string | undefined;

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

    // Resolve prompt entity override (falls back to template.basePrompt)
    const basePrompt = await resolvePrompt(
      this.entityService,
      context.templateName,
      template.basePrompt,
    );

    const searchTerms = [basePrompt, context.prompt].filter(Boolean).join(" ");
    const shouldSearchKnowledgeBase =
      searchTerms.length > 0 && template.useKnowledgeContext === true;

    const weightMap = this.entityService.getWeightMap();
    const hasWeights = Object.keys(weightMap).length > 0;

    const relevantEntities = shouldSearchKnowledgeBase
      ? await this.entityService.search({
          query: searchTerms,
          options: {
            limit: 5,
            ...(hasWeights && { weight: weightMap }),
          },
        })
      : [];

    const enhancedPrompt = await this.buildPrompt(
      { basePrompt },
      context,
      relevantEntities,
    );

    const systemPrompt = this.buildSystemPrompt(basePrompt);

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
        .map((result) => this.formatRelevantEntity(result, urlGenerator))
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

  private formatRelevantEntity(
    result: SearchResult,
    urlGenerator: EntityUrlGenerator,
  ): string {
    const { entity, excerpt } = result;
    const entityType = entity.entityType;
    const parsed = entitySlugSchema.safeParse(entity.metadata);
    const slug = parsed.success ? parsed.data.slug : entity.id;

    if (this.siteBaseUrl && urlGenerator.hasRoute(entityType)) {
      const path = urlGenerator.generateUrl(entityType, slug);
      const url = `https://${this.siteBaseUrl}${path}`;
      return `[${entityType}] ${entity.id}: ${excerpt} (${url})`;
    }

    return `[${entityType}] ${entity.id}: ${excerpt}`;
  }
}
