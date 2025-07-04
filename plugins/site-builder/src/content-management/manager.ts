import type { Logger } from "@brains/types";
import type { IEntityService as EntityService } from "@brains/entity-service";
import type {
  SiteContentEntityType,
  RouteDefinition,
  SectionDefinition,
} from "@brains/view-registry";
import type { PluginContext } from "@brains/plugin-utils";
import type { SiteContentPreview, SiteContentProduction } from "../types";
import type {
  SiteContent,
  PromoteOptions,
  PromoteResult,
  RollbackOptions,
  RollbackResult,
  RegenerateOptions,
  RegenerateResult,
  GenerateOptions,
  GenerateResult,
  ContentComparison,
  SiteContentJob,
  JobStatusSummary,
} from "./types";
import { isPreviewContent, isProductionContent } from "./types";
import {
  generateSiteContentId,
  previewToProductionId,
} from "./utils/id-generator";
import { compareContent } from "./utils/comparator";
import { ContentPromotionError } from "../errors";

/**
 * Site content management operations
 * Handles promotion, rollback, and regeneration of site content
 */
export class SiteContentManager {
  constructor(
    private readonly entityService: EntityService,
    private readonly logger?: Logger,
    private readonly pluginContext?: PluginContext,
  ) {}

  /**
   * Promote preview content to production
   */
  async promote(options: PromoteOptions): Promise<PromoteResult> {
    this.logger?.info("Starting promote operation", { options });

    const result: PromoteResult = {
      success: true,
      promoted: [],
      skipped: [],
      errors: [],
    };

    try {
      // Get preview entities to promote
      const previewEntities = await this.getPreviewEntities(options);

      for (const previewEntity of previewEntities) {
        try {
          // Skip if dry run
          if (options.dryRun) {
            this.logger?.debug("Dry run: would promote", {
              previewId: previewEntity.id,
              page: previewEntity.page,
              section: previewEntity.section,
            });
            continue;
          }

          // Generate production entity ID
          const productionId = previewToProductionId(previewEntity.id);
          if (!productionId) {
            result.skipped.push({
              page: previewEntity.page,
              section: previewEntity.section,
              reason: "Invalid preview entity ID format",
            });
            continue;
          }

          // Check if production entity already exists
          const existingProduction = await this.entityService.getEntity(
            "site-content-production",
            productionId,
          );

          if (existingProduction) {
            // Update existing production entity
            const updatedProductionEntity: SiteContentProduction = {
              ...(existingProduction as SiteContentProduction),
              content: previewEntity.content,
              page: previewEntity.page,
              section: previewEntity.section,
              updated: new Date().toISOString(),
            };

            await this.entityService.updateEntityAsync(updatedProductionEntity);
            this.logger?.debug("Updated existing production content", {
              previewId: previewEntity.id,
              productionId,
            });
          } else {
            // Create new production entity with deterministic ID
            const productionEntity: Omit<
              SiteContentProduction,
              "created" | "updated"
            > = {
              id: productionId,
              entityType: "site-content-production",
              content: previewEntity.content,
              page: previewEntity.page,
              section: previewEntity.section,
            };

            await this.entityService.createEntityAsync(productionEntity);
            this.logger?.debug("Created new production content", {
              previewId: previewEntity.id,
              productionId,
            });
          }

          result.promoted.push({
            page: previewEntity.page,
            section: previewEntity.section,
            previewId: previewEntity.id,
            productionId,
          });
        } catch (error) {
          const promotionError = new ContentPromotionError(
            `Failed to promote content ${previewEntity.id}`,
            error,
            {
              previewId: previewEntity.id,
              productionId: previewToProductionId(previewEntity.id),
            },
          );
          const errorMessage = promotionError.message;
          result.errors?.push(errorMessage);
          this.logger?.error("Failed to promote content", {
            previewId: previewEntity.id,
            error: promotionError,
          });
        }
      }

      result.success = (result.errors?.length ?? 0) === 0;
      this.logger?.info("Promote operation completed", {
        promoted: result.promoted.length,
        skipped: result.skipped.length,
        errors: result.errors?.length ?? 0,
      });

      return result;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      this.logger?.error("Promote operation failed", { error: errorMessage });
      return {
        success: false,
        promoted: [],
        skipped: [],
        errors: [errorMessage],
      };
    }
  }

  /**
   * Promote all preview content to production
   */
  async promoteAll(): Promise<PromoteResult> {
    this.logger?.info("Starting promote all operation");

    return this.promote({ dryRun: false });
  }

  /**
   * Rollback production content (delete production entities)
   */
  async rollback(options: RollbackOptions): Promise<RollbackResult> {
    this.logger?.info("Starting rollback operation", { options });

    const result: RollbackResult = {
      success: true,
      rolledBack: [],
      skipped: [],
      errors: [],
    };

    try {
      // Get production entities to rollback
      const productionEntities = await this.getProductionEntities(options);

      for (const productionEntity of productionEntities) {
        try {
          // Skip if dry run
          if (options.dryRun) {
            this.logger?.debug("Dry run: would rollback", {
              productionId: productionEntity.id,
              page: productionEntity.page,
              section: productionEntity.section,
            });
            continue;
          }

          await this.entityService.deleteEntity(productionEntity.id);

          result.rolledBack.push({
            page: productionEntity.page,
            section: productionEntity.section,
            productionId: productionEntity.id,
          });

          this.logger?.debug("Rolled back production content", {
            productionId: productionEntity.id,
          });
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : "Unknown error";
          result.errors?.push(
            `Failed to rollback ${productionEntity.id}: ${errorMessage}`,
          );
          this.logger?.error("Failed to rollback content", {
            productionId: productionEntity.id,
            error: errorMessage,
          });
        }
      }

      result.success = (result.errors?.length ?? 0) === 0;
      this.logger?.info("Rollback operation completed", {
        rolledBack: result.rolledBack.length,
        skipped: result.skipped.length,
        errors: result.errors?.length ?? 0,
      });

      return result;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      this.logger?.error("Rollback operation failed", { error: errorMessage });
      return {
        success: false,
        rolledBack: [],
        skipped: [],
        errors: [errorMessage],
      };
    }
  }

  /**
   * Generate content for sections that don't have it
   */
  async generate(
    options: GenerateOptions,
    routes: RouteDefinition[],
    generateCallback: (
      route: RouteDefinition,
      section: SectionDefinition,
    ) => Promise<{
      content: string;
    }>,
  ): Promise<GenerateResult> {
    this.logger?.info("Starting generate operation", { options });

    const result: GenerateResult = {
      success: true,
      sectionsGenerated: 0,
      totalSections: 0,
      generated: [],
      skipped: [],
      errors: [],
    };

    try {
      // Filter routes by page if specified
      const { page } = options;
      const filteredRoutes = page
        ? routes.filter((route) => route.path.includes(page))
        : routes;

      // Count total sections to generate
      let totalSections = 0;
      for (const route of filteredRoutes) {
        const sectionsToCheck = options.section
          ? route.sections.filter((section) => section.id === options.section)
          : route.sections;

        totalSections += sectionsToCheck.filter(
          (section) =>
            "contentEntity" in section &&
            section.contentEntity &&
            !("content" in section && section.content),
        ).length;
      }

      result.totalSections = totalSections;

      if (totalSections === 0) {
        result.message = "No sections need content generation";
        this.logger?.info("Generate operation completed - no content needed");
        return result;
      }

      for (const route of filteredRoutes) {
        const sectionsToProcess = options.section
          ? route.sections.filter((section) => section.id === options.section)
          : route.sections;

        const sectionsNeedingContent = sectionsToProcess.filter(
          (section) =>
            "contentEntity" in section &&
            section.contentEntity &&
            !("content" in section && section.content),
        );

        for (const section of sectionsNeedingContent) {
          if (!section.contentEntity) continue;

          // Check if content already exists - always check preview content for generation
          const existingEntities = await this.entityService.listEntities(
            "site-content-preview",
            section.contentEntity.query
              ? { filter: { metadata: section.contentEntity.query } }
              : undefined,
          );

          if (existingEntities.length > 0) {
            result.skipped.push({
              page: route.path,
              section: section.id,
              reason: "Content already exists",
            });
            continue;
          }

          // Skip if dry run
          if (options.dryRun) {
            this.logger?.debug("Dry run: would generate content", {
              page: route.path,
              section: section.id,
            });
            result.generated.push({
              page: route.path,
              section: section.id,
              entityId: "dry-run-entity-id",
              entityType: section.contentEntity.entityType,
            });
            result.sectionsGenerated++;
            continue;
          }

          try {
            // Use the callback to generate content
            const generated = await generateCallback(route, section);

            // Always generate preview content with deterministic ID
            const targetEntityType = "site-content-preview" as const;
            const page = section.contentEntity.query?.["page"] as string;
            const sectionId = section.contentEntity.query?.[
              "section"
            ] as string;

            const deterministic_id = this.generateId(
              targetEntityType,
              page,
              sectionId,
            );

            // Create the entity with deterministic ID
            const siteContentEntity: Omit<
              SiteContentPreview,
              "created" | "updated"
            > = {
              id: deterministic_id,
              entityType: targetEntityType,
              content: generated.content,
              page,
              section: sectionId,
            };

            await this.entityService.createEntityAsync(siteContentEntity);

            result.generated.push({
              page: route.path,
              section: section.id,
              entityId: deterministic_id,
              entityType: targetEntityType,
            });
            result.sectionsGenerated++;

            this.logger?.debug("Generated content for section", {
              page: route.path,
              section: section.id,
              entityId: deterministic_id,
            });
          } catch (error) {
            const errorMessage =
              error instanceof Error ? error.message : "Unknown error";
            result.errors?.push(
              `Failed to generate content for ${route.path}:${section.id}: ${errorMessage}`,
            );
            this.logger?.error("Failed to generate section content", {
              page: route.path,
              section: section.id,
              error: errorMessage,
            });
          }
        }
      }

      result.success = (result.errors?.length ?? 0) === 0;
      result.message = `Generated content for ${result.sectionsGenerated} sections`;

      this.logger?.info("Generate operation completed", {
        sectionsGenerated: result.sectionsGenerated,
        totalSections: result.totalSections,
        skipped: result.skipped.length,
        errors: result.errors?.length ?? 0,
      });

      return result;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      this.logger?.error("Generate operation failed", { error: errorMessage });
      return {
        success: false,
        sectionsGenerated: 0,
        totalSections: 0,
        generated: [],
        skipped: [],
        errors: [errorMessage],
      };
    }
  }

  /**
   * Regenerate content using AI with different modes
   */
  async regenerate(
    options: RegenerateOptions,
    regenerateCallback: (
      entityType: SiteContentEntityType,
      page: string,
      section: string,
      mode: "leave" | "new" | "with-current",
      progress: { current: number; total: number; message: string },
      currentContent?: string,
    ) => Promise<{
      entityId: string;
      content: string;
    }>,
  ): Promise<RegenerateResult> {
    this.logger?.info("Starting regenerate operation", { options });

    const result: RegenerateResult = {
      success: true,
      regenerated: [],
      skipped: [],
      errors: [],
    };

    try {
      // Only regenerate preview content - production content comes from promotion
      const entityTypes: SiteContentEntityType[] = ["site-content-preview"];

      // Count total entities to process for progress tracking
      let totalEntities = 0;
      const entityTypeMap = new Map<
        SiteContentEntityType,
        (SiteContentPreview | SiteContentProduction)[]
      >();

      for (const entityType of entityTypes) {
        // Build filter for finding entities
        const filter: Record<string, unknown> = {
          page: options.page,
        };

        if (options.section) {
          filter["section"] = options.section;
        }

        // Get existing entities to regenerate
        const entities = await this.entityService.listEntities(entityType, {
          filter: { metadata: filter },
        });

        entityTypeMap.set(
          entityType,
          entities as (SiteContentPreview | SiteContentProduction)[],
        );
        totalEntities += entities.length;
      }

      let processedEntities = 0;

      for (const entityType of entityTypes) {
        const entities = entityTypeMap.get(entityType) ?? [];

        for (const entity of entities) {
          const siteContent = entity as
            | SiteContentPreview
            | SiteContentProduction;

          const progressInfo = {
            current: processedEntities,
            total: totalEntities,
            message: `Regenerating ${entityType}:${siteContent.page}:${siteContent.section}...`,
          };

          try {
            // Skip if dry run
            if (options.dryRun) {
              this.logger?.debug("Dry run: would regenerate content", {
                entityType,
                page: siteContent.page,
                section: siteContent.section,
                mode: options.mode,
              });
              result.regenerated.push({
                page: siteContent.page,
                section: siteContent.section,
                entityId: siteContent.id,
                mode: options.mode,
              });
              processedEntities++;
              continue;
            }

            // Handle different modes
            if (options.mode === "leave") {
              // Mode "leave": Keep content as-is, no regeneration needed
              result.skipped.push({
                page: siteContent.page,
                section: siteContent.section,
                reason: "Mode 'leave' - content kept as-is",
              });
              processedEntities++;
              continue;
            }

            // For "new" and "with-current" modes, we need to regenerate
            const currentContent =
              options.mode === "with-current" ? siteContent.content : undefined;

            const regenerated = await regenerateCallback(
              entityType,
              siteContent.page,
              siteContent.section,
              options.mode,
              progressInfo,
              currentContent,
            );

            // Update the entity with new content
            const updatedEntity = {
              ...siteContent,
              content: regenerated.content,
              updated: new Date().toISOString(),
            };

            await this.entityService.updateEntityAsync(updatedEntity);

            result.regenerated.push({
              page: siteContent.page,
              section: siteContent.section,
              entityId: siteContent.id,
              mode: options.mode,
            });

            this.logger?.debug("Regenerated content", {
              entityType,
              page: siteContent.page,
              section: siteContent.section,
              mode: options.mode,
              entityId: siteContent.id,
            });
          } catch (error) {
            const errorMessage =
              error instanceof Error ? error.message : "Unknown error";
            result.errors?.push(
              `Failed to regenerate ${entityType}:${siteContent.page}:${siteContent.section}: ${errorMessage}`,
            );
            this.logger?.error("Failed to regenerate content", {
              entityType,
              page: siteContent.page,
              section: siteContent.section,
              error: errorMessage,
            });
          }

          processedEntities++;
        }
      }

      result.success = (result.errors?.length ?? 0) === 0;

      this.logger?.info("Regenerate operation completed", {
        regenerated: result.regenerated.length,
        skipped: result.skipped.length,
        errors: result.errors?.length ?? 0,
      });

      return result;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      this.logger?.error("Regenerate operation failed", {
        error: errorMessage,
      });
      return {
        success: false,
        regenerated: [],
        skipped: [],
        errors: [errorMessage],
      };
    }
  }

  /**
   * Generate content for all sections across all pages
   */
  async generateAll(
    routes: RouteDefinition[],
    generateCallback: (
      route: RouteDefinition,
      section: SectionDefinition,
      progress: { current: number; total: number; message: string },
    ) => Promise<{
      content: string;
    }>,
  ): Promise<GenerateResult> {
    this.logger?.info("Starting generate all operation");

    return this.generateWithProgress(
      { dryRun: false },
      routes,
      generateCallback,
    );
  }

  /**
   * Generate content with progress tracking
   */
  private async generateWithProgress(
    options: GenerateOptions,
    routes: RouteDefinition[],
    generateCallback: (
      route: RouteDefinition,
      section: SectionDefinition,
      progress: { current: number; total: number; message: string },
    ) => Promise<{
      content: string;
    }>,
  ): Promise<GenerateResult> {
    this.logger?.info("Starting generate operation with progress tracking", {
      options,
    });

    const result: GenerateResult = {
      success: true,
      sectionsGenerated: 0,
      totalSections: 0,
      generated: [],
      skipped: [],
      errors: [],
    };

    try {
      // Filter routes by page if specified
      const { page } = options;
      const filteredRoutes = page
        ? routes.filter((route) => route.path.includes(page))
        : routes;

      // Count total sections to generate
      let totalSections = 0;
      for (const route of filteredRoutes) {
        const sectionsToCheck = options.section
          ? route.sections.filter((section) => section.id === options.section)
          : route.sections;

        totalSections += sectionsToCheck.filter(
          (section) =>
            "contentEntity" in section &&
            section.contentEntity &&
            !("content" in section && section.content),
        ).length;
      }

      result.totalSections = totalSections;

      if (totalSections === 0) {
        result.message = "No sections need content generation";
        this.logger?.info("Generate operation completed - no content needed");
        return result;
      }

      let processedSections = 0;

      for (const route of filteredRoutes) {
        const sectionsToProcess = options.section
          ? route.sections.filter((section) => section.id === options.section)
          : route.sections;

        const sectionsNeedingContent = sectionsToProcess.filter(
          (section) =>
            "contentEntity" in section &&
            section.contentEntity &&
            !("content" in section && section.content),
        );

        for (const section of sectionsNeedingContent) {
          if (!section.contentEntity) continue;

          const progressInfo = {
            current: processedSections,
            total: totalSections,
            message: `Processing ${route.path}:${section.id}...`,
          };

          // Check if content already exists - always check preview content for generation
          const existingEntities = await this.entityService.listEntities(
            "site-content-preview",
            section.contentEntity.query
              ? { filter: { metadata: section.contentEntity.query } }
              : undefined,
          );

          if (existingEntities.length > 0) {
            result.skipped.push({
              page: route.path,
              section: section.id,
              reason: "Content already exists",
            });
            processedSections++;
            continue;
          }

          // Skip if dry run
          if (options.dryRun) {
            this.logger?.debug("Dry run: would generate content", {
              page: route.path,
              section: section.id,
            });
            result.generated.push({
              page: route.path,
              section: section.id,
              entityId: "dry-run-entity-id",
              entityType: section.contentEntity.entityType,
            });
            result.sectionsGenerated++;
            processedSections++;
            continue;
          }

          try {
            // Use the callback to generate content
            const generated = await generateCallback(
              route,
              section,
              progressInfo,
            );

            // Always generate preview content with deterministic ID
            const targetEntityType = "site-content-preview" as const;
            const page = section.contentEntity.query?.["page"] as string;
            const sectionId = section.contentEntity.query?.[
              "section"
            ] as string;

            const deterministic_id = this.generateId(
              targetEntityType,
              page,
              sectionId,
            );

            // Create the entity with deterministic ID
            const siteContentEntity: Omit<
              SiteContentPreview,
              "created" | "updated"
            > = {
              id: deterministic_id,
              entityType: targetEntityType,
              content: generated.content,
              page,
              section: sectionId,
            };

            await this.entityService.createEntityAsync(siteContentEntity);

            result.generated.push({
              page: route.path,
              section: section.id,
              entityId: deterministic_id,
              entityType: targetEntityType,
            });
            result.sectionsGenerated++;

            this.logger?.debug("Generated content for section", {
              page: route.path,
              section: section.id,
              entityId: deterministic_id,
            });
          } catch (error) {
            const errorMessage =
              error instanceof Error ? error.message : "Unknown error";
            result.errors?.push(
              `Failed to generate content for ${route.path}:${section.id}: ${errorMessage}`,
            );
            this.logger?.error("Failed to generate section content", {
              page: route.path,
              section: section.id,
              error: errorMessage,
            });
          }

          processedSections++;
        }
      }

      // Final progress is reported by the last callback

      result.success = (result.errors?.length ?? 0) === 0;
      result.message = `Generated content for ${result.sectionsGenerated} sections`;

      this.logger?.info("Generate operation with progress completed", {
        sectionsGenerated: result.sectionsGenerated,
        totalSections: result.totalSections,
        skipped: result.skipped.length,
        errors: result.errors?.length ?? 0,
      });

      return result;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      this.logger?.error("Generate operation with progress failed", {
        error: errorMessage,
      });
      return {
        success: false,
        sectionsGenerated: 0,
        totalSections: 0,
        generated: [],
        skipped: [],
        errors: [errorMessage],
      };
    }
  }

  /**
   * Regenerate all existing content using AI with the specified mode
   */
  async regenerateAll(
    mode: "leave" | "new" | "with-current",
    regenerateCallback: (
      entityType: SiteContentEntityType,
      page: string,
      section: string,
      mode: "leave" | "new" | "with-current",
      progress: { current: number; total: number; message: string },
      currentContent?: string,
    ) => Promise<{
      entityId: string;
      content: string;
    }>,
    options: { dryRun?: boolean } = {},
  ): Promise<{
    success: boolean;
    totalPages: number;
    regenerated: Array<{
      page: string;
      section: string;
      entityId: string;
      mode: "leave" | "new" | "with-current";
    }>;
    skipped: Array<{
      page: string;
      section: string;
      reason: string;
    }>;
    errors: string[];
  }> {
    this.logger?.info("Starting regenerate all operation", {
      mode,
      options,
    });

    const result = {
      success: true,
      totalPages: 0,
      regenerated: [] as Array<{
        page: string;
        section: string;
        entityId: string;
        mode: "leave" | "new" | "with-current";
      }>,
      skipped: [] as Array<{
        page: string;
        section: string;
        reason: string;
      }>,
      errors: [] as string[],
    };

    try {
      // Get all site content entities (both preview and production)
      const entityTypes: SiteContentEntityType[] = [
        "site-content-preview",
        "site-content-production",
      ];

      const allPages = new Set<string>();
      for (const entityType of entityTypes) {
        const entities = await this.entityService.listEntities(entityType);
        const siteContentEntities = entities as (
          | SiteContentPreview
          | SiteContentProduction
        )[];

        for (const entity of siteContentEntities) {
          allPages.add(entity.page);
        }
      }

      result.totalPages = allPages.size;

      // Regenerate each page (preview content only - production comes from promotion)
      for (const page of allPages) {
        try {
          const pageResult = await this.regenerate(
            {
              page,
              environment: "preview",
              mode,
              dryRun: options.dryRun ?? false,
            },
            regenerateCallback,
          );

          if (pageResult.success) {
            result.regenerated.push(...pageResult.regenerated);
            result.skipped.push(...pageResult.skipped);
          } else {
            result.errors.push(
              ...(pageResult.errors ?? [`Failed to regenerate page: ${page}`]),
            );
          }
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : "Unknown error";
          result.errors.push(
            `Failed to regenerate page ${page}: ${errorMessage}`,
          );
          this.logger?.error("Failed to regenerate page", {
            page,
            error: errorMessage,
          });
        }
      }

      result.success = result.errors.length === 0;

      this.logger?.info("Regenerate all operation completed", {
        totalPages: result.totalPages,
        regenerated: result.regenerated.length,
        skipped: result.skipped.length,
        errors: result.errors.length,
      });

      return result;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      this.logger?.error("Regenerate all operation failed", {
        error: errorMessage,
      });
      return {
        success: false,
        totalPages: 0,
        regenerated: [],
        skipped: [],
        errors: [errorMessage],
      };
    }
  }

  /**
   * Compare preview and production content for a page and section
   */
  async compare(
    page: string,
    section: string,
  ): Promise<ContentComparison | null> {
    try {
      const previewId = generateSiteContentId(
        "site-content-preview",
        page,
        section,
      );
      const productionId = generateSiteContentId(
        "site-content-production",
        page,
        section,
      );

      const [preview, production] = await Promise.all([
        this.entityService.getEntity("site-content-preview", previewId),
        this.entityService.getEntity("site-content-production", productionId),
      ]);

      // Both must exist for comparison
      if (!preview || !production) {
        return null;
      }

      // Validate entity types
      if (
        !isPreviewContent(preview as SiteContent) ||
        !isProductionContent(production as SiteContent)
      ) {
        throw new Error("Invalid entity types for comparison");
      }

      return compareContent(
        page,
        section,
        preview as SiteContentPreview,
        production as SiteContentProduction,
      );
    } catch (error) {
      this.logger?.error("Failed to compare content", {
        page,
        section,
        error: error instanceof Error ? error.message : "Unknown error",
      });
      return null;
    }
  }

  /**
   * Check if content exists for a page and section
   */
  async exists(
    page: string,
    section: string,
    type: "preview" | "production",
  ): Promise<boolean> {
    try {
      const entityType =
        type === "preview" ? "site-content-preview" : "site-content-production";
      const id = generateSiteContentId(entityType, page, section);
      const entity = await this.entityService.getEntity(entityType, id);
      return !!entity;
    } catch (error) {
      this.logger?.error("Failed to check content existence", {
        page,
        section,
        type,
        error: error instanceof Error ? error.message : "Unknown error",
      });
      return false;
    }
  }

  /**
   * Generate deterministic entity ID
   */
  generateId(
    type: SiteContentEntityType,
    page: string,
    section: string,
  ): string {
    return generateSiteContentId(type, page, section);
  }

  /**
   * Get preview entities based on filter options
   */
  private async getPreviewEntities(
    options: PromoteOptions | RollbackOptions,
  ): Promise<SiteContentPreview[]> {
    // Build filter for entity service
    const filter: Record<string, unknown> = {};

    if (options.page) {
      filter["page"] = options.page;
    }

    if (options.section) {
      filter["section"] = options.section;
    }

    // Get entities
    const entities = await this.entityService.listEntities(
      "site-content-preview",
      Object.keys(filter).length > 0
        ? { filter: { metadata: filter } }
        : undefined,
    );

    return entities as SiteContentPreview[];
  }

  /**
   * Get production entities based on filter options
   */
  private async getProductionEntities(
    options: RollbackOptions,
  ): Promise<SiteContentProduction[]> {
    // Build filter for entity service
    const filter: Record<string, unknown> = {};

    if (options.page) {
      filter["page"] = options.page;
    }

    if (options.section) {
      filter["section"] = options.section;
    }

    // Get entities
    const entities = await this.entityService.listEntities(
      "site-content-production",
      Object.keys(filter).length > 0
        ? { filter: { metadata: filter } }
        : undefined,
    );

    return entities as SiteContentProduction[];
  }

  /**
   * Generate content asynchronously using job queue
   * Phase 1: Enqueue jobs for content generation
   */
  async generateAsync(
    options: GenerateOptions,
    routes: RouteDefinition[],
    templateResolver: (section: SectionDefinition) => string,
    siteConfig?: Record<string, unknown>,
  ): Promise<{
    jobs: SiteContentJob[];
    totalSections: number;
    queuedSections: number;
  }> {
    this.logger?.info("Starting async generate operation", { options });

    if (!this.pluginContext) {
      throw new Error("PluginContext required for async content generation");
    }

    const jobs: SiteContentJob[] = [];
    let totalSections = 0;
    let queuedSections = 0;

    try {
      // Filter routes by page if specified
      const { page } = options;
      const filteredRoutes = page
        ? routes.filter((route) => route.path.includes(page))
        : routes;

      // Count total sections to generate
      for (const route of filteredRoutes) {
        const sectionsToCheck = options.section
          ? route.sections.filter((section) => section.id === options.section)
          : route.sections;

        totalSections += sectionsToCheck.filter(
          (section) =>
            "contentEntity" in section &&
            section.contentEntity &&
            !("content" in section && section.content),
        ).length;
      }

      if (totalSections === 0) {
        this.logger?.info(
          "Async generate operation completed - no content needed",
        );
        return { jobs: [], totalSections: 0, queuedSections: 0 };
      }

      for (const route of filteredRoutes) {
        const sectionsToProcess = options.section
          ? route.sections.filter((section) => section.id === options.section)
          : route.sections;

        const sectionsNeedingContent = sectionsToProcess.filter(
          (section) =>
            "contentEntity" in section &&
            section.contentEntity &&
            !("content" in section && section.content),
        );

        for (const section of sectionsNeedingContent) {
          if (!section.contentEntity) continue;

          // Check if content already exists - always check preview content for generation
          const existingEntities = await this.entityService.listEntities(
            "site-content-preview",
            section.contentEntity.query
              ? { filter: { metadata: section.contentEntity.query } }
              : undefined,
          );

          if (existingEntities.length > 0) {
            this.logger?.debug("Skipping section - content already exists", {
              page: route.path,
              section: section.id,
            });
            continue;
          }

          // Skip if dry run
          if (options.dryRun) {
            this.logger?.debug("Dry run: would generate content", {
              page: route.path,
              section: section.id,
            });
            queuedSections++;
            continue;
          }

          try {
            // Get template name and entity metadata
            const templateName = templateResolver(section);
            const page = section.contentEntity.query?.["page"] as string;
            const sectionId = section.contentEntity.query?.[
              "section"
            ] as string;

            // Enqueue content generation job
            const jobId = await this.pluginContext.enqueueContentGeneration({
              templateName,
              context: {
                prompt: `Generate content for ${route.path}/${section.id}`,
                data: {
                  route,
                  section,
                  siteConfig,
                },
              },
            });

            // Track the job
            const job: SiteContentJob = {
              jobId,
              route,
              section,
              templateName,
              targetEntityType: "site-content-preview",
              page,
              sectionId,
            };

            jobs.push(job);
            queuedSections++;

            this.logger?.debug("Enqueued content generation job", {
              jobId,
              page: route.path,
              section: section.id,
              templateName,
            });
          } catch (error) {
            const errorMessage =
              error instanceof Error ? error.message : "Unknown error";
            this.logger?.error("Failed to enqueue content generation job", {
              page: route.path,
              section: section.id,
              error: errorMessage,
            });
            // Continue with other sections even if one fails
          }
        }
      }

      this.logger?.info("Async generate operation completed", {
        totalSections,
        queuedSections,
        jobIds: jobs.length,
      });

      return { jobs, totalSections, queuedSections };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      this.logger?.error("Async generate operation failed", {
        error: errorMessage,
      });
      throw error;
    }
  }

  /**
   * Wait for async content generation jobs to complete and create entities
   * Phase 2: Wait for job completion and create entities
   */
  async waitAndCreateEntities(
    jobs: SiteContentJob[],
    timeoutMs: number = 60000,
    progressCallback?: (
      completed: number,
      total: number,
      message: string,
    ) => void,
  ): Promise<GenerateResult> {
    this.logger?.info("Waiting for async content generation", {
      jobCount: jobs.length,
      timeoutMs,
    });

    if (!this.pluginContext) {
      throw new Error("PluginContext required for async content generation");
    }

    const result: GenerateResult = {
      success: true,
      sectionsGenerated: 0,
      totalSections: jobs.length,
      generated: [],
      skipped: [],
      errors: [],
    };

    try {
      let completedJobs = 0;

      // Report initial progress
      progressCallback?.(0, jobs.length, "Starting content generation jobs...");

      // Wait for all jobs to complete with progress tracking
      const jobResults = await Promise.allSettled(
        jobs.map(async (job) => {
          try {
            // Report progress for this job
            progressCallback?.(
              completedJobs,
              jobs.length,
              `Generating content for ${job.page}/${job.sectionId}...`,
            );

            if (!this.pluginContext) {
              throw new Error("PluginContext required for async content generation");
            }
            
            const content = await this.pluginContext.waitForJob(
              job.jobId,
              timeoutMs,
            );

            completedJobs++;
            progressCallback?.(
              completedJobs,
              jobs.length,
              `Completed ${completedJobs}/${jobs.length} content generation jobs`,
            );

            return { job, content, success: true };
          } catch (error) {
            completedJobs++;
            const errorMessage =
              error instanceof Error ? error.message : "Unknown error";
            this.logger?.error("Job failed", {
              jobId: job.jobId,
              error: errorMessage,
            });

            progressCallback?.(
              completedJobs,
              jobs.length,
              `Failed ${completedJobs}/${jobs.length} - ${errorMessage}`,
            );

            return { job, error: errorMessage, success: false };
          }
        }),
      );

      // Process results and create entities
      for (const jobResult of jobResults) {
        if (jobResult.status === "rejected") {
          result.errors?.push(`Job processing failed: ${jobResult.reason}`);
          continue;
        }

        const { job, content, success, error } = jobResult.value;

        if (!success) {
          result.errors?.push(`Job ${job.jobId} failed: ${error}`);
          continue;
        }

        // Create entity with the generated content
        try {
          const deterministic_id = this.generateId(
            job.targetEntityType,
            job.page,
            job.sectionId,
          );

          // Create the entity with deterministic ID (always preview for async generation)
          if (!content) {
            throw new Error(`Content generation failed for job ${job.jobId}`);
          }

          const siteContentEntity: Omit<
            SiteContentPreview,
            "created" | "updated"
          > = {
            id: deterministic_id,
            entityType: "site-content-preview",
            content: content,
            page: job.page,
            section: job.sectionId,
          };

          await this.entityService.createEntityAsync(siteContentEntity);

          result.sectionsGenerated++;
          result.generated.push({
            page: job.route.path,
            section: job.section.id,
            entityId: deterministic_id,
            entityType: job.targetEntityType,
          });

          this.logger?.debug("Created entity from async content generation", {
            jobId: job.jobId,
            entityId: deterministic_id,
            page: job.page,
            section: job.sectionId,
          });
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : "Unknown error";
          result.errors?.push(
            `Failed to create entity for job ${job.jobId}: ${errorMessage}`,
          );
        }
      }

      result.success = (result.errors?.length ?? 0) === 0;

      // Final progress update
      progressCallback?.(
        jobs.length,
        jobs.length,
        `Content generation complete: ${result.sectionsGenerated} sections generated`,
      );

      this.logger?.info("Async generation wait completed", {
        generated: result.sectionsGenerated,
        errors: result.errors?.length ?? 0,
      });

      return result;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      this.logger?.error("Async generation wait failed", {
        error: errorMessage,
      });

      return {
        success: false,
        sectionsGenerated: 0,
        totalSections: jobs.length,
        generated: [],
        skipped: [],
        errors: [errorMessage],
      };
    }
  }

  /**
   * Convenience method combining both phases with progress tracking
   */
  async generateAsyncComplete(
    options: GenerateOptions,
    routes: RouteDefinition[],
    templateResolver: (section: SectionDefinition) => string,
    siteConfig?: Record<string, unknown>,
    timeoutMs: number = 60000,
    progressCallback?: (
      completed: number,
      total: number,
      message: string,
    ) => void,
  ): Promise<GenerateResult> {
    this.logger?.info("Starting complete async generation", { options });

    try {
      // Phase 1: Enqueue jobs
      progressCallback?.(0, 1, "Analyzing sections and queueing jobs...");

      const { jobs, totalSections, queuedSections } = await this.generateAsync(
        options,
        routes,
        templateResolver,
        siteConfig,
      );

      if (jobs.length === 0) {
        const message =
          totalSections === 0
            ? "No sections need content generation"
            : "All sections already have content";

        progressCallback?.(1, 1, message);

        return {
          success: true,
          sectionsGenerated: 0,
          totalSections,
          generated: [],
          skipped: [],
          errors: [],
          message,
        };
      }

      this.logger?.info("Queued jobs for async generation", {
        totalSections,
        queuedSections,
        jobCount: jobs.length,
      });

      // Phase 2: Wait for completion and create entities
      return await this.waitAndCreateEntities(
        jobs,
        timeoutMs,
        progressCallback,
      );
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      this.logger?.error("Complete async generation failed", {
        error: errorMessage,
      });
      throw error;
    }
  }

  /**
   * Get status summary for multiple jobs
   */
  async getJobStatuses(jobs: SiteContentJob[]): Promise<JobStatusSummary> {
    if (!this.pluginContext) {
      throw new Error("PluginContext required for job status checking");
    }

    let pending = 0;
    let processing = 0;
    let completed = 0;
    let failed = 0;
    const jobStatuses: JobStatusSummary["jobs"] = [];

    try {
      const statusPromises = jobs.map(async (job) => {
        try {
          if (!this.pluginContext) {
            throw new Error("PluginContext is required for job status checking");
          }
          const status = await this.pluginContext.getJobStatus(job.jobId);
          return { job, status };
        } catch (error) {
          return { job, status: null, error };
        }
      });

      const results = await Promise.allSettled(statusPromises);

      for (const result of results) {
        if (result.status === "rejected") {
          failed++;
          jobStatuses.push({
            jobId: "unknown",
            sectionId: "unknown",
            status: "failed",
            error: "Failed to get job status",
          });
          continue;
        }

        const { job, status } = result.value;

        if (!status) {
          failed++;
          jobStatuses.push({
            jobId: job.jobId,
            sectionId: job.sectionId,
            status: "failed",
            error: "Job not found",
          });
          continue;
        }

        // Count statuses
        switch (status.status) {
          case "pending":
            pending++;
            break;
          case "processing":
            processing++;
            break;
          case "completed":
            completed++;
            break;
          case "failed":
            failed++;
            break;
        }

        jobStatuses.push({
          jobId: job.jobId,
          sectionId: job.sectionId,
          status: status.status,
          ...(status.error && { error: status.error }),
        });
      }

      return {
        total: jobs.length,
        pending,
        processing,
        completed,
        failed,
        jobs: jobStatuses,
      };
    } catch (error) {
      this.logger?.error("Failed to get job statuses", { error });
      throw error;
    }
  }
}
