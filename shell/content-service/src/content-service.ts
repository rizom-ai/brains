import type {
  GenerationContext,
  ContentTemplate,
  ResolutionOptions,
} from "./types";
import type { IEntityService } from "@brains/entity-service";
import type { IAIService } from "@brains/ai-service";
import type { Logger } from "@brains/utils";
import type { ContentService as IContentService } from "./types";
import type { TemplateRegistry } from "@brains/templates";
import { TemplateCapabilities } from "@brains/templates";
import type {
  DataSourceRegistry,
  BaseDataSourceContext,
} from "@brains/entity-service";

/**
 * Dependencies required by ContentService
 */
export interface ContentServiceDependencies {
  logger: Logger;
  entityService: IEntityService;
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
      .filter((template) => template.basePrompt ?? template.formatter) // Only content templates
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
   * Resolve content for a template using multiple resolution strategies
   * Priority order: DataSource fetch -> saved content -> fallback
   *
   * Note: Templates MUST have a formatter to work with saved content from entities.
   */
  async resolveContent<T = unknown>(
    templateName: string,
    options?: ResolutionOptions,
    pluginId?: string,
  ): Promise<T | null> {
    // Apply template scoping if pluginId is provided
    const scopedTemplateName = this.applyTemplateScoping(
      templateName,
      pluginId,
    );

    const template = this.dependencies.templateRegistry.get(scopedTemplateName);
    if (!template) {
      this.dependencies.logger.debug(
        `Template not found: ${scopedTemplateName}`,
      );
      return null;
    }

    // 1. Priority: DataSource fetch (real-time data like dashboard stats)
    if (template.dataSourceId && TemplateCapabilities.canFetch(template)) {
      const dataSource = this.dependencies.dataSourceRegistry.get(
        template.dataSourceId,
      );
      if (dataSource) {
        try {
          // DataSource handles fetching and any needed transformation internally
          if (dataSource.fetch) {
            // Build context from options with scoped entityService
            const context: BaseDataSourceContext = {
              ...(options?.publishedOnly !== undefined && {
                publishedOnly: options.publishedOnly,
              }),
              // Provide scoped entityService that auto-applies publishedOnly
              entityService: this.createScopedEntityService(
                options?.publishedOnly,
              ),
            };

            const data = await dataSource.fetch(
              options?.dataParams,
              template.schema,
              context,
            );
            if (data !== undefined) {
              this.dependencies.logger.debug(
                `Resolved content via DataSource fetch for ${scopedTemplateName}`,
              );
              return data as T;
            }
          }
        } catch (error) {
          this.dependencies.logger.debug(
            `DataSource operation failed for ${scopedTemplateName}`,
            { error },
          );
        }
      }
    }

    // 2. Try saved content (previously stored/generated content)
    // IMPORTANT: Templates must have a formatter to parse entity-stored content
    if (options?.savedContent) {
      if (!template.formatter) {
        this.dependencies.logger.warn(
          `Template ${scopedTemplateName} has no formatter but saved content was requested. ` +
            `Templates must have a formatter to parse entity-stored content.`,
        );
      } else {
        try {
          const entity = await this.dependencies.entityService.getEntity(
            options.savedContent.entityType,
            options.savedContent.entityId,
          );
          if (entity?.content) {
            this.dependencies.logger.debug(
              `Resolved content from saved entity for ${scopedTemplateName}`,
            );
            // Use the formatter to parse the content
            return this.parseContent(scopedTemplateName, entity.content) as T;
          }
        } catch (error) {
          this.dependencies.logger.debug(
            `No saved content found for ${scopedTemplateName}: ${options.savedContent.entityType}/${options.savedContent.entityId}`,
            { error },
          );
        }
      }
    }

    // 3. Static fallback content
    if (options?.fallback !== undefined) {
      try {
        const validated = template.schema.parse(options.fallback);
        this.dependencies.logger.debug(
          `Using fallback content for ${scopedTemplateName}`,
        );
        return validated as T;
      } catch (error) {
        this.dependencies.logger.debug(
          `Fallback content validation failed for ${scopedTemplateName}`,
          { error },
        );
      }
    }

    // No resolution strategy succeeded
    this.dependencies.logger.debug(
      `No content could be resolved for ${scopedTemplateName}`,
    );
    return null;
  }

  /**
   * Create a scoped entityService that auto-applies publishedOnly filter
   * In production (publishedOnly=true), all listEntities calls get publishedOnly: true
   * In preview (publishedOnly=false/undefined), no filter is added
   *
   * IMPORTANT: If the caller already provides a status filter, we skip adding
   * publishedOnly to avoid conflicting WHERE clauses (e.g., status='published' AND status='queued')
   */
  private createScopedEntityService(
    publishedOnly: boolean | undefined,
  ): IEntityService {
    const baseService = this.dependencies.entityService;

    // If not in production mode, return the base service unchanged
    if (!publishedOnly) {
      return baseService;
    }

    // Use Proxy to intercept listEntities/countEntities while properly forwarding
    // all other methods (including prototype methods on class instances)
    return new Proxy(baseService, {
      get(target, prop, receiver) {
        if (prop === "listEntities") {
          return (
            entityType: string,
            options?: Parameters<IEntityService["listEntities"]>[1],
          ) => {
            const hasStatusFilter =
              options?.filter?.metadata?.["status"] !== undefined;
            return target.listEntities(entityType, {
              ...options,
              ...(!hasStatusFilter && { publishedOnly: true }),
            });
          };
        }
        if (prop === "countEntities") {
          return (
            entityType: string,
            options?: Parameters<IEntityService["countEntities"]>[1],
          ) => {
            const hasStatusFilter =
              options?.filter?.metadata?.["status"] !== undefined;
            return target.countEntities(entityType, {
              ...options,
              ...(!hasStatusFilter && { publishedOnly: true }),
            });
          };
        }
        // Forward all other property access, binding methods to preserve 'this'
        const value = Reflect.get(target, prop, receiver);
        if (typeof value === "function") {
          return value.bind(target);
        }
        return value;
      },
    });
  }

  /**
   * Generate content using a template with entity-aware context
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
