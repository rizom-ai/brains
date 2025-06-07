import type {
  Registry,
  EntityService,
  BaseEntity,
  PluginContext,
  GeneratedContent,
} from "@brains/types";
import {
  dashboardSchema,
  landingPageSchema,
  type DashboardData,
  type LandingPageData,
} from "./content-schemas";
import type { Logger } from "@brains/utils";
import { generateWithTemplate } from "@brains/utils";
import { join } from "path";
import { landingPageTemplate } from "./content-templates";
import { existsSync, mkdirSync } from "fs";
import { writeFile } from "fs/promises";
import * as yaml from "js-yaml";

export interface ContentGeneratorOptions {
  logger: Logger;
  registry: Registry;
  context: PluginContext;
  astroSiteDir: string;
  siteTitle: string;
  siteDescription: string;
  siteUrl?: string | undefined;
}

/**
 * Generates content files for the static site
 */
export class ContentGenerator {
  private logger: Logger;
  private registry: Registry;
  private context: PluginContext;
  private options: ContentGeneratorOptions;
  private contentDir: string;

  constructor(options: ContentGeneratorOptions) {
    this.logger = options.logger;
    this.registry = options.registry;
    this.context = options.context;
    this.options = options;
    this.contentDir = join(options.astroSiteDir, "src", "content");
  }

  /**
   * Initialize content directories
   */
  async initialize(): Promise<void> {
    this.logger.debug("Initializing content directories");

    // Create base content directory
    await this.ensureDirectory(this.contentDir);

    // Create collection directories
    await this.ensureDirectory(join(this.contentDir, "landing"));
    await this.ensureDirectory(join(this.contentDir, "dashboard"));
    // Future: notes, articles, etc.
  }

  /**
   * Ensure a directory exists
   */
  private async ensureDirectory(dir: string): Promise<void> {
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
      this.logger.debug(`Created directory: ${dir}`);
    }
  }

  /**
   * Write a YAML file to a collection
   */
  private async writeYamlFile(
    collection: string,
    filename: string,
    data: unknown,
  ): Promise<void> {
    const filePath = join(this.contentDir, collection, filename);
    const yamlContent = yaml.dump(data);
    await writeFile(filePath, yamlContent);
    this.logger.debug(`Wrote ${filePath}`);
  }

  /**
   * Generate landing page data using query processor
   */
  async generateLandingPage(): Promise<void> {
    this.logger.info("Generating landing page data");

    // Check for existing landing page content first
    const existingContent = await this.getExistingSiteContent(
      "landing",
      "page",
    );

    let landingData: LandingPageData | undefined;
    let validExistingContent = false;

    if (existingContent) {
      // Validate that existing content has all required fields
      const contentValidation = landingPageSchema.safeParse(existingContent);

      if (contentValidation.success) {
        this.logger.info("Using existing site content for landing page");
        // Use existing content - but update title and tagline to current values
        landingData = {
          ...contentValidation.data,
          title: this.options.siteTitle,
          tagline: this.options.siteDescription,
        };
        validExistingContent = true;
      } else {
        this.logger.warn(
          "Existing landing page content is invalid, generating new content",
          { errors: contentValidation.error.errors },
        );
      }
    }

    if (!validExistingContent) {
      this.logger.info("Generating new landing page content with AI");

      // Use the template helper with additional context and save the result
      // TODO: Refactor to avoid context binding - perhaps expose generateContent as a standalone function
      landingData = await generateWithTemplate(
        this.context.generateContent.bind(this.context),
        landingPageTemplate,
        "landing:page",
        {
          prompt: `This is for "${this.options.siteTitle}" - ${this.options.siteDescription}.
          Please generate content that reflects this specific brain's purpose.`,
          data: {
            siteTitle: this.options.siteTitle,
            siteDescription: this.options.siteDescription,
          },
          style: "professional and engaging",
        },
        {
          save: true,
        },
      );
    }

    if (!landingData) {
      throw new Error("Failed to generate landing page data");
    }

    // Validate final data before writing
    const finalValidation = landingPageSchema.safeParse(landingData);
    if (!finalValidation.success) {
      this.logger.error("Generated landing page data is invalid", {
        errors: finalValidation.error.errors,
      });
      throw new Error("Failed to generate valid landing page data");
    }

    // Write to landing collection
    await this.writeYamlFile("landing", "index.yaml", landingData);

    this.logger.info("Landing page data generated");
  }

  /**
   * Generate dashboard data from brain content
   */
  async generateDashboard(): Promise<void> {
    this.logger.info("Generating dashboard data");

    // EntityService is resolved from the registry
    const entityService = this.registry.resolve<EntityService>("entityService");

    // Get all entity types in the system
    const entityTypes = entityService.getEntityTypes();
    let totalEntityCount = 0;
    const allEntities: BaseEntity[] = [];

    // Collect entities from all types
    for (const entityType of entityTypes) {
      try {
        const entities = await entityService.listEntities<BaseEntity>(
          entityType,
          {
            limit: 100,
            sortBy: "updated",
            sortDirection: "desc",
          },
        );
        totalEntityCount += entities.length;
        allEntities.push(...entities);
      } catch (error) {
        this.logger.debug(
          `Failed to list entities of type ${entityType}:`,
          error,
        );
      }
    }

    // Get recent entities for display
    const recentEntities = allEntities
      .sort(
        (a, b) => new Date(b.updated).getTime() - new Date(a.updated).getTime(),
      )
      .slice(0, 5)
      .map((entity) => {
        // Try to extract a title from the entity
        let title = "Untitled";

        // Check if entity has a title property (from entity-specific fields)
        if ("title" in entity && typeof entity.title === "string") {
          title = entity.title;
        } else {
          // Try to extract from content (first line, first 50 chars)
          const firstLine = entity.content.split("\n")[0] ?? "";
          title = firstLine.slice(0, 50) + (firstLine.length > 50 ? "..." : "");
        }

        return {
          id: entity.id,
          title,
          created: entity.created,
        };
      });

    // Create dashboard data
    const dashboardData: DashboardData = {
      title: this.options.siteTitle,
      description: this.options.siteDescription,
      stats: {
        entityCount: totalEntityCount,
        entityTypeCount: entityTypes.length,
        lastUpdated: new Date().toISOString(),
      },
      recentEntities,
    };

    // Validate data against schema
    const validatedData = dashboardSchema.parse(dashboardData);

    // Write to dashboard collection
    await this.writeYamlFile("dashboard", "index.yaml", validatedData);

    this.logger.info("Dashboard data generated", {
      entityCount: totalEntityCount,
      entityTypeCount: entityTypes.length,
    });
  }

  /**
   * Get existing generated content for a specific page and section
   * Uses contentType format: "landing:hero"
   */
  async getExistingSiteContent(
    page: string,
    section: string,
  ): Promise<unknown | null> {
    const entityService = this.registry.resolve<EntityService>("entityService");

    // Create a content type and add the plugin namespace for querying
    const contentType = `${page}:${section}`;
    const namespacedContentType = `${this.context.pluginId}:${contentType}`;

    try {
      // Look for generated-content entities with matching contentType
      const results = await entityService.listEntities<GeneratedContent>(
        "generated-content",
        {
          filter: { metadata: { contentType: namespacedContentType } },
          limit: 1,
          sortBy: "created",
          sortDirection: "desc",
        },
      );

      if (results.length === 0) {
        this.logger.debug("No existing generated content found", {
          contentType: namespacedContentType,
        });
        return null;
      }

      const matchingContent = results[0];
      if (!matchingContent) {
        return null;
      }
      this.logger.info("Found existing generated content", {
        contentType: namespacedContentType,
      });
      return matchingContent.data;
    } catch (error) {
      this.logger.debug("Error looking for generated content", {
        page,
        section,
        error,
      });
      return null;
    }
  }

  /**
   * Generate all content for the site
   */
  async generateAll(): Promise<void> {
    // Ensure directories exist
    await this.initialize();

    // Generate content
    await this.generateLandingPage();
    await this.generateDashboard();
    // Future: generateNotePages(), generateArticlePages(), etc.
  }
}
