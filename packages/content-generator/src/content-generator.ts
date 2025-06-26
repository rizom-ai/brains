import type {
  ContentTemplate,
  RouteDefinition,
  SectionDefinition,
  Logger,
} from "@brains/types";

/**
 * Progress information for content generation operations
 */
export interface ProgressInfo {
  current: number;
  total: number;
  message: string;
}

/**
 * Dependencies required by ContentGenerator
 */
export interface ContentGeneratorDependencies {
  generateWithTemplate: (
    template: ContentTemplate,
    context: GenerationContext,
  ) => Promise<unknown>;
  getTemplate: (name: string) => ContentTemplate | null;
  listRoutes: () => RouteDefinition[];
  logger: Logger;
}

/**
 * Context for content generation
 */
export interface GenerationContext {
  prompt?: string;
  data?: Record<string, unknown>;
}

/**
 * Content Generator
 * 
 * Provides centralized content generation functionality with template-based approach.
 * Implements Component Interface Standardization pattern.
 */
export class ContentGenerator {
  private static instance: ContentGenerator | null = null;
  private static readonly TEMPLATE_NAMESPACE = "site-builder:";

  /**
   * Get the singleton instance of ContentGenerator
   */
  public static getInstance(
    dependencies: ContentGeneratorDependencies,
  ): ContentGenerator {
    ContentGenerator.instance ??= new ContentGenerator(dependencies);
    return ContentGenerator.instance;
  }

  /**
   * Reset the singleton instance (primarily for testing)
   */
  public static resetInstance(): void {
    ContentGenerator.instance = null;
  }

  /**
   * Create a fresh instance without affecting the singleton
   */
  public static createFresh(
    dependencies: ContentGeneratorDependencies,
  ): ContentGenerator {
    return new ContentGenerator(dependencies);
  }

  /**
   * Private constructor to enforce singleton pattern
   */
  private constructor(
    private readonly dependencies: ContentGeneratorDependencies,
  ) {}

  /**
   * Generate content using a template
   */
  async generateContent(
    templateName: string,
    context: GenerationContext = {},
  ): Promise<string> {
    const template = this.dependencies.getTemplate(templateName);
    if (!template) {
      throw new Error(`Template not found: ${templateName}`);
    }

    // Combine template prompt with additional context
    let finalPrompt = template.basePrompt;
    if (context.prompt) {
      finalPrompt = `${template.basePrompt}\n\nAdditional instructions: ${context.prompt}`;
    }

    // Generate content using template
    const templateContext: GenerationContext = {
      prompt: finalPrompt,
    };
    
    if (context.data !== undefined) {
      templateContext.data = context.data;
    }
    
    const generatedContent = await this.dependencies.generateWithTemplate(
      template,
      templateContext,
    );

    // Format content using template's formatter
    return this.formatContent(template, generatedContent);
  }

  /**
   * Convenience method for route-based content generation
   */
  async generateWithRoute(
    route: RouteDefinition,
    section: SectionDefinition,
    progressInfo: ProgressInfo,
    additionalContext: Record<string, unknown> = {},
  ): Promise<string> {
    if (!section.template) {
      throw new Error(`No template specified for section ${section.id}`);
    }

    const templateName = this.resolveTemplateName(section.template);
    
    const context: GenerationContext = {
      data: {
        pageTitle: route.title,
        pageDescription: route.description,
        sectionId: section.id,
        progressInfo: {
          currentSection: progressInfo.current,
          totalSections: progressInfo.total,
          processingStage: progressInfo.message,
        },
        ...additionalContext,
      },
    };

    return this.generateContent(templateName, context);
  }

  /**
   * Regenerate content for a specific entity
   */
  async regenerateContent(
    entityType: string,
    page: string,
    section: string,
    mode: "leave" | "new" | "with-current",
    progressInfo: ProgressInfo,
    currentContent?: string,
  ): Promise<{ entityId: string; content: string }> {
    // Find the template for this page/section
    const { template, templateName } = this.findTemplateForEntity(page, section);

    // Prepare the prompt based on mode
    let effectivePrompt = template.basePrompt;
    if (mode === "with-current" && currentContent) {
      effectivePrompt = `${template.basePrompt}\n\nCurrent content to improve:\n${currentContent}`;
    }

    const context: GenerationContext = {
      prompt: effectivePrompt,
      data: {
        pageTitle: page,
        sectionId: section,
        regenerationMode: mode,
        progressInfo: {
          currentSection: progressInfo.current,
          totalSections: progressInfo.total,
          processingStage: progressInfo.message,
        },
      },
    };

    const content = await this.generateContent(templateName, context);

    return {
      entityId: `${entityType}:${page}:${section}`,
      content,
    };
  }

  /**
   * Resolve template name with namespace prefix
   */
  private resolveTemplateName(template: string): string {
    return template.includes(":")
      ? template
      : `${ContentGenerator.TEMPLATE_NAMESPACE}${template}`;
  }

  /**
   * Find template for a specific entity by page and section
   */
  private findTemplateForEntity(
    page: string,
    section: string,
  ): { template: ContentTemplate; templateName: string } {
    const routes = this.dependencies.listRoutes();

    for (const route of routes) {
      if (route.id === page) {
        const matchingSection = route.sections.find((s) => s.id === section);
        if (matchingSection?.template) {
          const templateName = this.resolveTemplateName(matchingSection.template);
          const template = this.dependencies.getTemplate(templateName);
          
          if (!template) {
            throw new Error(
              `Template not found for page: ${page}, section: ${section}`,
            );
          }

          return { template, templateName };
        }
      }
    }

    throw new Error(`Template not found for page: ${page}, section: ${section}`);
  }

  /**
   * Format content using template's formatter
   */
  private formatContent(
    template: ContentTemplate,
    generatedContent: unknown,
  ): string {
    return template.formatter
      ? template.formatter.format(generatedContent)
      : typeof generatedContent === "string"
        ? generatedContent
        : JSON.stringify(generatedContent);
  }
}