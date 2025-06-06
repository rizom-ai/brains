import type {
  Registry,
  EntityService,
  BaseEntity,
  PluginContext,
  GeneratedContent,
} from "@brains/types";
import {
  dashboardSchema,
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

    // Check for existing hero content first
    const existingHero = await this.getExistingSiteContent("landing", "hero");

    let landingData: LandingPageData;

    if (existingHero) {
      this.logger.info("Using existing site content for landing page hero");
      // Use existing content - merge with default structure
      landingData = {
        title: this.options.siteTitle,
        tagline: this.options.siteDescription,
        hero: existingHero as LandingPageData["hero"],
      };
    } else {
      this.logger.info("Generating new landing page content with AI");

      // Use the template helper with additional context and save the result
      // TODO: Refactor to avoid context binding - perhaps expose generateContent as a standalone function
      landingData = await generateWithTemplate(
        this.context.generateContent.bind(this.context),
        landingPageTemplate,
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
          contentType: "landing:hero",
        },
      );
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

    // Create a unique contentType for this content
    const contentType = `${page}:${section}`;

    try {
      // Look for generated-content entities with matching contentType
      const results = await entityService.listEntities<GeneratedContent>(
        "generated-content",
        {
          filter: { metadata: { contentType } },
          limit: 1,
          sortBy: "created",
          sortDirection: "desc",
        },
      );

      if (results.length === 0) {
        this.logger.debug("No existing generated content found", {
          contentType,
        });
        return null;
      }

      const matchingContent = results[0];
      if (!matchingContent) {
        return null;
      }
      this.logger.info("Found existing generated content", { contentType });
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
