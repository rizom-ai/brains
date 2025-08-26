import type { GenerationContext, ContentTemplate } from "./types";
import type { EntityService } from "@brains/entity-service";
import type { IAIService } from "@brains/ai-service";
import type { Logger } from "@brains/utils";
import type {
  RouteDefinition,
  SectionDefinition,
} from "@brains/render-service";
import type { ContentService as IContentService } from "./types";
import type { TemplateRegistry } from "@brains/templates";
import type { DataSourceRegistry } from "@brains/datasource";

/**
 * Progress information for content generation operations
 */
export interface ProgressInfo {
  current: number;
  total: number;
  message: string;
}

/**
 * Dependencies required by ContentService
 */
export interface ContentServiceDependencies {
  logger: Logger;
  entityService: EntityService;
  aiService: IAIService;
  templateRegistry: TemplateRegistry;
  dataSourceRegistry: DataSourceRegistry;
}

/**
 * Content Service
 *
 * Provides content coordination, provider management, and common utilities.
 * Implements Component Interface Standardization pattern.
 */
export class ContentService implements IContentService {
  /**
   * Create a new instance of ContentService
   */
  constructor(private readonly dependencies: ContentServiceDependencies) {}

  /**
   * Apply template scoping logic
   */
  private applyTemplateScoping(
    templateName: string,
    pluginId?: string,
  ): string {
    // If no pluginId provided, use template name as-is
    if (!pluginId) {
      return templateName;
    }

    // If template name already has scoping (contains ":"), use as-is
    if (templateName.includes(":")) {
      return templateName;
    }

    // Apply plugin scoping
    return `${pluginId}:${templateName}`;
  }

  /**
   * Get a registered template
   */
  getTemplate(name: string): ContentTemplate<unknown> | null {
    const template = this.dependencies.templateRegistry.get(name);
    if (!template) return null;

    // Convert unified Template back to ContentTemplate format
    const contentTemplate: ContentTemplate<unknown> = {
      name: template.name,
      description: template.description,
      schema: template.schema,
      requiredPermission: template.requiredPermission,
    };

    if (template.basePrompt) {
      contentTemplate.basePrompt = template.basePrompt;
    }

    if (template.formatter) {
      contentTemplate.formatter = template.formatter;
    }

    if (template.dataSourceId) {
      contentTemplate.dataSourceId = template.dataSourceId;
    }

    return contentTemplate;
  }

  /**
   * List all available templates
   */
  listTemplates(): ContentTemplate<unknown>[] {
    return this.dependencies.templateRegistry
      .list()
      .filter((template) => template.basePrompt || template.formatter) // Only content templates
      .map((template) => {
        const contentTemplate: ContentTemplate<unknown> = {
          name: template.name,
          description: template.description,
          schema: template.schema,
          requiredPermission: template.requiredPermission,
        };

        if (template.basePrompt) {
          contentTemplate.basePrompt = template.basePrompt;
        }

        if (template.formatter) {
          contentTemplate.formatter = template.formatter;
        }

        if (template.dataSourceId) {
          contentTemplate.dataSourceId = template.dataSourceId;
        }

        return contentTemplate;
      });
  }

  /**
   * Generate content using a template with entity-aware context
   * TODO: Factor out conversationId from content generation - it should be handled
   * at a higher level (e.g., in conversation-aware interfaces) rather than being
   * part of the core content generation logic
   */
  async generateContent<T = unknown>(
    templateName: string,
    context: GenerationContext = {},
    pluginId?: string,
  ): Promise<T> {
    // Apply template scoping if pluginId is provided
    const scopedTemplateName = this.applyTemplateScoping(
      templateName,
      pluginId,
    );

    const template = this.getTemplate(scopedTemplateName);
    if (!template) {
      throw new Error(`Template not found: ${scopedTemplateName}`);
    }

    // Cast template to correct type
    const typedTemplate = template as ContentTemplate<T>;

    // Check if template has a DataSource configured
    if (!typedTemplate.dataSourceId) {
      throw new Error(
        `Template ${scopedTemplateName} doesn't support content generation. Add dataSourceId to enable generation through DataSource pattern.`,
      );
    }

    // Use DataSource pattern for generation
    const dataSource = this.dependencies.dataSourceRegistry.get(
      typedTemplate.dataSourceId,
    );

    if (!dataSource) {
      throw new Error(`DataSource ${typedTemplate.dataSourceId} not found`);
    }

    if (!dataSource.generate) {
      // This DataSource doesn't support generation (e.g., fetch-only like system-stats)
      throw new Error(
        `Template ${scopedTemplateName} uses DataSource ${typedTemplate.dataSourceId} which doesn't support content generation. This template is for data fetching only.`,
      );
    }

    const request = {
      templateName: scopedTemplateName,
      ...context,
    };

    return dataSource.generate(request, typedTemplate.schema);
  }

  /**
   * Parse existing content using a template's formatter
   */
  parseContent<T = unknown>(
    templateName: string,
    content: string,
    pluginId?: string,
  ): T {
    // Apply template scoping if pluginId is provided
    const scopedTemplateName = this.applyTemplateScoping(
      templateName,
      pluginId,
    );

    const template = this.getTemplate(scopedTemplateName);
    if (!template) {
      throw new Error(`Template not found: ${scopedTemplateName}`);
    }

    // Cast template to correct type
    const typedTemplate = template as ContentTemplate<T>;

    if (!typedTemplate.formatter) {
      throw new Error(
        `Template ${scopedTemplateName} does not have a formatter for parsing`,
      );
    }

    // Use the formatter to parse the content
    return typedTemplate.formatter.parse(content);
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

    const templateName = section.template;

    const context: GenerationContext = {
      conversationId: "system",
      data: {
        routeId: route.id,
        routeTitle: route.title,
        routeDescription: route.description,
        sectionId: section.id,
        progressInfo: {
          currentSection: progressInfo.current,
          totalSections: progressInfo.total,
          processingStage: progressInfo.message,
        },
        ...additionalContext,
      },
    };

    // Generate content as object first
    const contentObject = await this.generateContent(templateName, context);

    // Use the formatContent method to convert object to string
    return this.formatContent(templateName, contentObject);
  }

  /**
   * Format content using a template's formatter
   */
  formatContent<T = unknown>(
    templateName: string,
    data: T,
    options?: { truncate?: number; pluginId?: string },
  ): string {
    // Apply template scoping if pluginId is provided
    const scopedTemplateName = this.applyTemplateScoping(
      templateName,
      options?.pluginId,
    );

    const template = this.getTemplate(scopedTemplateName);
    if (!template) {
      throw new Error(`Template not found: ${scopedTemplateName}`);
    }

    if (!template.formatter) {
      throw new Error(
        `Template ${scopedTemplateName} does not have a formatter`,
      );
    }

    // Use the formatter to convert object to string
    let formatted = template.formatter.format(data);

    // Apply truncation if requested
    if (options?.truncate && formatted.length > options.truncate) {
      formatted = formatted.substring(0, options.truncate) + "...";
    }

    return formatted;
  }
}
