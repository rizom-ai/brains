import type {
  GenerateContentOptions,
  GenerationContext,
  ContentTemplate,
  ResolutionOptions,
} from "./types";
import type {
  ContentGenerationPlan,
  ContentGenerationRequestInput,
  ContentGenerationJobData,
  ContentGenerationBatchResult,
} from "./generation-contracts";
import {
  submitContentGeneration,
  type GenerationQueueBinding,
} from "./generation-submission";
import { planContentGeneration } from "./generation-planner";
import { createGenerationReadContext } from "./generation-read-context";
import type {
  GenerationAccess,
  GenerationAuthorizer,
} from "./generation-authorization";
import { authorizeGenerationWrite } from "./generation-write-authorization";
import { scopeTemplateName } from "./template-scope";
import type { BaseEntity, IEntityService } from "@brains/entity-service";
import type { IAIService } from "@brains/ai-service";
import { isPlainRecord } from "@brains/utils/predicates";
import type { Logger } from "@brains/utils/logger";
import type { ContentService as IContentService } from "./types";
import type { TemplateRegistry, Template } from "@brains/templates";
import { TemplateCapabilities } from "@brains/templates";
import { scopeEntityReads } from "@brains/entity-service";
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
  generationAuthorizer: GenerationAuthorizer;
}

/**
 * Content Service
 *
 * Provides content coordination, provider management, and common utilities.
 * Implements Component Interface Standardization pattern.
 */
export class ContentService implements IContentService {
  private readonly dependencies: ContentServiceDependencies;
  /**
   * Create a new instance of ContentService
   */
  constructor(dependencies: ContentServiceDependencies) {
    this.dependencies = dependencies;
  }

  async planGeneration(
    request: ContentGenerationRequestInput,
    signal?: AbortSignal,
  ): Promise<ContentGenerationPlan> {
    return planContentGeneration(
      {
        ...this.dependencies,
        authorizer: this.dependencies.generationAuthorizer,
      },
      request,
      signal,
    );
  }

  submitGeneration(
    request: ContentGenerationRequestInput,
    binding: GenerationQueueBinding,
    signal?: AbortSignal,
  ): Promise<ContentGenerationBatchResult> {
    return submitContentGeneration(this, request, binding, signal);
  }

  authorizeGenerationWrite(
    data: ContentGenerationJobData,
    persisted?: Readonly<BaseEntity>,
  ): Promise<GenerationAccess> {
    return authorizeGenerationWrite(
      {
        ...this.dependencies,
        authorizer: this.dependencies.generationAuthorizer,
      },
      data,
      persisted,
    );
  }

  /**
   * Convert a unified Template to ContentTemplate format
   */
  private toContentTemplate(template: Template): ContentTemplate<unknown> {
    const ct: ContentTemplate<unknown> = {
      name: template.name,
      description: template.description,
      schema: template.schema,
      requiredPermission: template.requiredPermission,
    };
    if (template.basePrompt) ct.basePrompt = template.basePrompt;
    if (template.formatter) ct.formatter = template.formatter;
    if (template.dataSourceId) ct.dataSourceId = template.dataSourceId;
    return ct;
  }

  /**
   * Get a registered template
   */
  getTemplate(name: string): ContentTemplate<unknown> | null {
    const template = this.dependencies.templateRegistry.get(name);
    if (!template) return null;
    return this.toContentTemplate(template);
  }

  /**
   * List all available templates
   */
  listTemplates(): ContentTemplate<unknown>[] {
    return this.dependencies.templateRegistry
      .list()
      .filter((template) => template.basePrompt ?? template.formatter)
      .map((template) => this.toContentTemplate(template));
  }

  /**
   * Resolve content for a template using multiple resolution strategies
   * Priority order: DataSource fetch -> saved content -> fallback
   *
   * Note: Templates MUST have a formatter to work with saved content from entities.
   */
  async resolveContent(
    templateName: string,
    options?: ResolutionOptions,
    pluginId?: string,
  ): Promise<unknown> {
    // Apply template scoping if pluginId is provided
    const scopedTemplateName = scopeTemplateName(templateName, pluginId);

    const template = this.dependencies.templateRegistry.get(scopedTemplateName);
    if (!template) {
      this.dependencies.logger.debug(
        `Template not found: ${scopedTemplateName}`,
      );
      return null;
    }

    // Single scoped entityService for the whole resolution. Every read path —
    // datasource fetch context AND savedContent fallback — goes through this
    // proxy, so the configured scope is enforced uniformly and cannot be
    // sidestepped by a future caller passing a wider scope.
    const scopedEntityService = scopeEntityReads(
      this.dependencies.entityService,
      {
        publishedOnly: options?.publishedOnly,
        visibilityScope: options?.visibilityScope,
      },
    );

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
              entityService: scopedEntityService,
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
              // Opt-in overlay: when the template declares an overlayFormatter,
              // the section's own saved content is merged over the live base
              // (authored fields win) instead of the two being mutually
              // exclusive. Absent → classic datasource-wins precedence.
              if (template.overlayFormatter && options?.savedContent) {
                return await this.applyContentOverlay(
                  scopedTemplateName,
                  template,
                  data,
                  options.savedContent,
                  scopedEntityService,
                );
              }
              return data;
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
    // Only a template with a formatter can parse entity-stored content. Site
    // builds offer saved content to every section, so a template without one
    // (a static page, a datasource-only section) skips it by design.
    if (options?.savedContent) {
      if (!template.formatter) {
        this.dependencies.logger.debug(
          `Template ${scopedTemplateName} has no formatter; skipping saved content`,
        );
      } else {
        try {
          const entity = await scopedEntityService.getEntity({
            entityType: options.savedContent.entityType,
            id: options.savedContent.entityId,
          });
          if (entity?.content) {
            this.dependencies.logger.debug(
              `Resolved content from saved entity for ${scopedTemplateName}`,
            );
            // Use the formatter to parse the content
            return this.parseContent(scopedTemplateName, entity.content);
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
        return validated;
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
   * Merge a section's authored saved content over a datasource base. The
   * saved entity is parsed with the template's overlayFormatter and shallow-
   * merged so authored fields win; the result is validated against the
   * template schema. Any miss — no saved entity, parse error, or a merged
   * shape that fails validation — falls back to the untouched base, so a
   * malformed override can never break a live section.
   */
  private async applyContentOverlay(
    scopedTemplateName: string,
    template: Template,
    base: unknown,
    savedContent: { entityType: string; entityId: string },
    scopedEntityService: IEntityService,
  ): Promise<unknown> {
    try {
      const entity = await scopedEntityService.getEntity({
        entityType: savedContent.entityType,
        id: savedContent.entityId,
      });
      if (!entity?.content) {
        return base;
      }
      const overlay = template.overlayFormatter?.parse(entity.content);
      if (overlay === undefined || overlay === null) {
        return base;
      }
      // Both come back from formatters as unknown; an overlay only makes sense
      // when each side is a record.
      if (!isPlainRecord(base) || !isPlainRecord(overlay)) {
        return base;
      }
      const merged = { ...base, ...overlay };
      const validated = template.schema.parse(merged);
      this.dependencies.logger.debug(
        `Applied authored content overlay for ${scopedTemplateName}`,
      );
      return validated;
    } catch (error) {
      this.dependencies.logger.debug(
        `Content overlay skipped for ${scopedTemplateName}, using datasource base`,
        { error },
      );
      return base;
    }
  }

  /**
   * Generate content using a template with entity-aware context
   */
  async generateContent(
    templateName: string,
    context: GenerationContext = {},
    options: GenerateContentOptions = {},
  ): Promise<unknown> {
    const { pluginId, signal, visibilityScope } = options;
    signal?.throwIfAborted();
    const scopedTemplateName = scopeTemplateName(templateName, pluginId);

    const template = this.getTemplate(scopedTemplateName);
    if (!template) {
      throw new Error(`Template not found: ${scopedTemplateName}`);
    }

    // Check if template has a DataSource configured
    if (!template.dataSourceId) {
      throw new Error(
        `Template ${scopedTemplateName} doesn't support content generation. Add dataSourceId to enable generation through DataSource pattern.`,
      );
    }

    // Use DataSource pattern for generation
    const dataSource = this.dependencies.dataSourceRegistry.get(
      template.dataSourceId,
    );

    if (!dataSource) {
      throw new Error(`DataSource ${template.dataSourceId} not found`);
    }

    const request = {
      ...context,
      templateName: scopedTemplateName,
    };
    if (visibilityScope) {
      if (!dataSource.generateScoped) {
        // A configuration gap, not an authorization failure; retrying cannot fix it.
        throw new Error(
          `DataSource ${template.dataSourceId} does not support visibility-scoped generation`,
        );
      }
      const result = await dataSource.generateScoped(
        request,
        template.schema,
        createGenerationReadContext(
          this.dependencies.entityService,
          { visibilityScope },
          signal,
        ),
      );
      signal?.throwIfAborted();
      return result;
    }

    if (!dataSource.generate) {
      // This DataSource doesn't support generation (e.g., fetch-only like system-stats)
      throw new Error(
        `Template ${scopedTemplateName} uses DataSource ${template.dataSourceId} which doesn't support content generation. This template is for data fetching only.`,
      );
    }

    const result = await dataSource.generate(request, template.schema, signal);
    signal?.throwIfAborted();
    return result;
  }

  /**
   * Parse existing content using a template's formatter
   */
  parseContent(
    templateName: string,
    content: string,
    pluginId?: string,
  ): unknown {
    // Apply template scoping if pluginId is provided
    const scopedTemplateName = scopeTemplateName(templateName, pluginId);

    const template = this.getTemplate(scopedTemplateName);
    if (!template) {
      throw new Error(`Template not found: ${scopedTemplateName}`);
    }

    if (!template.formatter) {
      throw new Error(
        `Template ${scopedTemplateName} does not have a formatter for parsing`,
      );
    }

    // Use the formatter to parse the content
    return template.formatter.parse(content);
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
    const scopedTemplateName = scopeTemplateName(
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
