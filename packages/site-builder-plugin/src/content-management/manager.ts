import type { EntityService, Logger } from "@brains/types";
import type {
  SiteContentEntityType,
  SiteContentPreview,
  SiteContentProduction,
  RouteDefinition,
  SectionDefinition,
} from "@brains/types";
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
} from "./types";
import { isPreviewContent, isProductionContent } from "./types";
import {
  generateSiteContentId,
  previewToProductionId,
} from "./utils/id-generator";
import { compareContent } from "./utils/comparator";

/**
 * Site content management operations
 * Handles promotion, rollback, and regeneration of site content
 */
export class SiteContentManager {
  constructor(
    private readonly entityService: EntityService,
    private readonly logger?: Logger,
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

            await this.entityService.updateEntity(updatedProductionEntity);
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

            await this.entityService.createEntity(productionEntity);
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
          const errorMessage =
            error instanceof Error ? error.message : "Unknown error";
          result.errors?.push(
            `Failed to promote ${previewEntity.id}: ${errorMessage}`,
          );
          this.logger?.error("Failed to promote content", {
            previewId: previewEntity.id,
            error: errorMessage,
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
      entityId: string;
      entityType: string;
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

          // Check if content already exists
          const existingEntities = await this.entityService.listEntities(
            section.contentEntity.entityType,
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

            result.generated.push({
              page: route.path,
              section: section.id,
              entityId: generated.entityId,
              entityType: generated.entityType,
            });
            result.sectionsGenerated++;

            this.logger?.debug("Generated content for section", {
              page: route.path,
              section: section.id,
              entityId: generated.entityId,
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
      // Determine which entity types to regenerate
      const entityTypes: SiteContentEntityType[] = [];
      if (options.environment === "preview" || options.environment === "both") {
        entityTypes.push("site-content-preview");
      }
      if (
        options.environment === "production" ||
        options.environment === "both"
      ) {
        entityTypes.push("site-content-production");
      }

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

        for (const entity of entities) {
          const siteContent = entity as
            | SiteContentPreview
            | SiteContentProduction;

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
              currentContent,
            );

            // Update the entity with new content
            const updatedEntity = {
              ...siteContent,
              content: regenerated.content,
              updated: new Date().toISOString(),
            };

            await this.entityService.updateEntity(updatedEntity);

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
}
