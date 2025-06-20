import type { BaseEntity, PluginContext } from "@brains/types";
import type { Logger } from "@brains/utils";
import { join } from "path";
import { existsSync, mkdirSync } from "fs";
import { writeFile } from "fs/promises";
import * as yaml from "js-yaml";
import type { SiteContent } from "./schemas";
import {
  type GeneralContext,
  GeneralContextFormatter,
} from "./content/general";

export interface ContentGeneratorOptions {
  logger: Logger;
  context: PluginContext;
  astroSiteDir: string;
  siteTitle: string;
  siteDescription: string;
  siteUrl?: string | undefined;
}

/**
 * Generates content files for the static site
 * Always generates content to the "preview" environment
 */
export class ContentGenerator {
  private logger: Logger;
  private context: PluginContext;
  private options: ContentGeneratorOptions;
  private contentDir: string;

  constructor(options: ContentGeneratorOptions) {
    this.logger = options.logger;
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
    const collectionDir = join(this.contentDir, collection);
    const filePath = join(collectionDir, filename);

    // Ensure the collection directory exists
    await this.ensureDirectory(collectionDir);

    const yamlContent = yaml.dump(data);

    this.logger.debug(`Writing YAML to ${filePath}`, {
      dataKeys: Object.keys(data as Record<string, unknown>),
      yamlLength: yamlContent.length,
      yamlPreview: yamlContent.substring(0, 200) + "...",
    });

    await writeFile(filePath, yamlContent);
    this.logger.debug(`Wrote ${filePath}`);
  }

  /**
   * Generate content using shell's content generation service
   */
  async generateContent(
    contentType: string,
    options: {
      prompt?: string;
      context?: Record<string, unknown>;
      force?: boolean;
    } = {},
    sendProgress?: (notification: {
      progress: number;
      total?: number;
      message?: string;
    }) => Promise<void>,
  ): Promise<void> {
    this.logger.info(`Generating content for ${contentType}`);

    const { force = false } = options;

    // TODO: Check if content already exists and skip if not forcing
    // This would require a way to query what content exists for a collection
    if (!force) {
      // TODO: Currently we always generate, but in the future we should check if content exists
    }

    await sendProgress?.({
      progress: 1,
      total: 3,
      message: `Generating ${contentType} content`,
    });

    // Use the ContentGenerationService to generate the collection
    const contentGenerationService = this.context.contentGenerationService;
    const generateOptions: {
      prompt?: string;
      context?: Record<string, unknown>;
    } = {};

    if (options.prompt !== undefined) {
      generateOptions.prompt = options.prompt;
    }
    if (options.context !== undefined) {
      generateOptions.context = options.context;
    }

    const generatedContent = await contentGenerationService.generateContent(
      contentType,
      generateOptions,
    );

    await sendProgress?.({
      progress: 2,
      total: 3,
      message: "Writing content files",
    });

    // Get the template to check if it's a collection
    const template = contentGenerationService.getTemplate(contentType);
    const isCollection = template?.items !== undefined;

    // Always save as entity for persistence
    if (isCollection) {
      // For collections, save each section as a separate entity
      await this.saveCollectionAsEntities(contentType, generatedContent);
    } else {
      // For individual content, save as a single entity
      await this.saveAsEntity(contentType, generatedContent);
    }

    // Always write YAML for all content types (collections and individual)
    // This ensures everything can be edited and is visible in the file system
    await this.writeContentYaml(contentType, generatedContent);

    await sendProgress?.({
      progress: 3,
      total: 3,
      message: "Content generation complete",
    });

    this.logger.info(`${contentType} generation complete`);
  }

  /**
   * Save a collection's sections as individual entities
   */
  private async saveCollectionAsEntities(
    collectionType: string,
    generatedContent: unknown,
  ): Promise<void> {
    if (typeof generatedContent !== "object" || generatedContent === null) {
      throw new Error(`Invalid collection content for ${collectionType}`);
    }

    const content = generatedContent as Record<string, unknown>;
    const parts = collectionType.split(":");
    if (parts.length < 2) {
      throw new Error(`Invalid collection type format: ${collectionType}`);
    }

    const page = parts[1];
    if (!page) {
      throw new Error(
        `Invalid collection type format - missing page: ${collectionType}`,
      );
    }

    // The ContentGenerationService already handles metadata merging,
    // so we need to reconstruct the sections including metadata
    const contentGenerationService = this.context.contentGenerationService;
    const template = contentGenerationService.getTemplate(collectionType);

    if (template?.items) {
      // Save each item as its own entity
      for (const [sectionKey] of Object.entries(template.items)) {
        if (sectionKey === "metadata") {
          // Metadata contains title and tagline from root level
          const metadata = {
            title: content["title"],
            tagline: content["tagline"],
          };
          const sectionContentType = `${collectionType}:metadata`;
          await this.saveAsEntity(sectionContentType, metadata);
        } else if (sectionKey in content) {
          // Regular sections
          const sectionContentType = `${collectionType}:${sectionKey}`;
          await this.saveAsEntity(sectionContentType, content[sectionKey]);
        }
      }
    }
  }

  /**
   * Save generated content as an entity in the database
   */
  private async saveAsEntity(
    contentType: string,
    generatedContent: unknown,
  ): Promise<void> {
    const contentTypeRegistry = this.context.contentTypeRegistry;

    // Parse content type to get page and section
    const parts = contentType.split(":");
    let page: string;
    let section: string;

    if (parts.length === 2) {
      // For 2-part types like "webserver:general", page = section = second part
      page = parts[1] ?? "";
      section = parts[1] ?? "";
    } else if (parts.length >= 3) {
      // For 3-part types like "webserver:landing:hero"
      page = parts[1] ?? "";
      section = parts[2] ?? "";
    } else {
      throw new Error(`Invalid content type format: ${contentType}`);
    }

    if (!page || !section) {
      throw new Error(
        `Invalid content type format - missing page or section: ${contentType}`,
      );
    }

    // Get the formatter for this content type
    const formatter = contentTypeRegistry.getFormatter(contentType);
    if (!formatter) {
      this.logger.warn(
        `No formatter found for ${contentType}, using YAML representation`,
      );
      // Fallback to YAML if no formatter
      const yamlContent = yaml.dump(generatedContent);
      await this.createOrUpdateEntity(page, section, yamlContent);
      return;
    }

    // Use the formatter to convert to markdown
    const markdownContent = formatter.format(generatedContent);

    await this.createOrUpdateEntity(page, section, markdownContent);
  }

  private async createOrUpdateEntity(
    page: string,
    section: string,
    content: string,
  ): Promise<void> {
    const entityService = this.context.entityService;

    // Check if entity already exists
    const existingEntities = await entityService.listEntities<SiteContent>(
      "site-content",
      {
        filter: {
          metadata: {
            page,
            section,
            environment: "preview",
          },
        },
      },
    );

    if (existingEntities.length > 0) {
      // Update existing entity
      const existing = existingEntities[0];
      if (!existing) {
        throw new Error(`Invalid existing entity for ${page}:${section}`);
      }
      await entityService.updateEntity({ ...existing, content });
      this.logger.debug(`Updated site-content entity for ${page}:${section}`);
    } else {
      // Create new entity
      await entityService.createEntity<SiteContent>({
        entityType: "site-content",
        content,
        page,
        section,
        environment: "preview",
      });
      this.logger.debug(`Created site-content entity for ${page}:${section}`);
    }
  }

  /**
   * Write content YAML for Astro by composing from individual entities
   */
  private async writeContentYaml(
    contentType: string,
    generatedContent: unknown,
  ): Promise<void> {
    // Determine collection name from content type
    // e.g., "webserver:landing" -> "landing"
    const parts = contentType.split(":");
    if (parts.length < 2) {
      throw new Error(`Invalid content type format: ${contentType}`);
    }

    const page = parts[1];
    if (!page) {
      throw new Error(`Invalid content type: ${contentType}`);
    }

    // For now, just write the generated content directly
    // TODO: In the future, we might want to compose this from the individual entities
    // to ensure consistency between what's in the DB and what's in the YAML files
    await this.writeYamlFile(page, "index.yaml", generatedContent);
  }

  /**
   * Generate landing page (for backward compatibility)
   */
  async generateLandingPage(
    sendProgress?: (notification: {
      progress: number;
      total?: number;
      message?: string;
    }) => Promise<void>,
    force = false,
  ): Promise<void> {
    await this.generateContent(
      "webserver:landing",
      {
        prompt: `Create a landing page for "${this.options.siteTitle}" - ${this.options.siteDescription}`,
        context: {
          siteTitle: this.options.siteTitle,
          siteDescription: this.options.siteDescription,
          siteUrl: this.options.siteUrl,
        },
        force,
      },
      sendProgress,
    );
  }

  /**
   * Generate dashboard (for backward compatibility)
   */
  async generateDashboard(
    _sendProgress?: (notification: {
      progress: number;
      total?: number;
      message?: string;
    }) => Promise<void>,
    _force = false,
  ): Promise<void> {
    // Dashboard is special - it shows real-time stats from the brain
    // So we generate it differently
    this.logger.info("Generating dashboard data");

    // Use EntityService from context
    const entityService = this.context.entityService;

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
    const dashboardData = {
      title: this.options.siteTitle,
      description: this.options.siteDescription,
      stats: {
        entityCount: totalEntityCount,
        entityTypeCount: entityTypes.length,
        lastUpdated: new Date().toISOString(),
      },
      recentEntities,
    };

    // Write to dashboard collection
    await this.writeYamlFile("dashboard", "index.yaml", dashboardData);

    this.logger.info("Dashboard data generated", {
      entityCount: totalEntityCount,
      entityTypeCount: entityTypes.length,
    });
  }

  /**
   * Generate all content for the site (always generates to preview environment)
   */
  async generateAll(
    sendProgress?: (notification: {
      progress: number;
      total?: number;
      message?: string;
    }) => Promise<void>,
    force = false,
  ): Promise<void> {
    // Ensure directories exist
    await this.initialize();

    const totalSteps = 4; // general context + landing + dashboard + complete
    let currentStep = 0;

    // Step 1: Get or generate general context
    await sendProgress?.({
      progress: ++currentStep,
      total: totalSteps,
      message: "Checking organizational context",
    });

    const entityService = this.context.entityService;

    // Check if general context already exists
    const existingGeneralEntities =
      await entityService.listEntities<SiteContent>("site-content", {
        filter: {
          metadata: {
            page: "general",
            section: "general",
            environment: "preview",
          },
        },
      });

    let generalContext: GeneralContext;
    const generalContextFormatter = new GeneralContextFormatter();

    if (
      !force &&
      existingGeneralEntities.length > 0 &&
      existingGeneralEntities[0]
    ) {
      // Use existing general context - parse from markdown
      try {
        generalContext = generalContextFormatter.parse(
          existingGeneralEntities[0].content,
        );
        this.logger.info("Using existing general context");
      } catch (error) {
        throw new Error(
          `Failed to parse existing general context: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    } else {
      // Generate new general context
      await sendProgress?.({
        progress: currentStep,
        total: totalSteps,
        message: force
          ? "Regenerating organizational context"
          : "Generating organizational context",
      });

      await this.generateContent("webserver:general", {
        prompt: `Create organizational context for "${this.options.siteTitle}" - ${this.options.siteDescription}`,
        context: {
          siteTitle: this.options.siteTitle,
          siteDescription: this.options.siteDescription,
          siteUrl: this.options.siteUrl,
        },
        force,
      });

      // Retrieve the newly generated general context
      const generalEntities = await entityService.listEntities<SiteContent>(
        "site-content",
        {
          filter: {
            metadata: {
              page: "general",
              section: "general",
              environment: "preview",
            },
          },
        },
      );

      if (generalEntities.length === 0 || !generalEntities[0]) {
        throw new Error("Failed to generate general context - no entity found");
      }

      try {
        generalContext = generalContextFormatter.parse(
          generalEntities[0].content,
        );
      } catch (error) {
        throw new Error(
          `Failed to parse general context: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    // Step 2: Generate landing page with general context
    await sendProgress?.({
      progress: ++currentStep,
      total: totalSteps,
      message: force
        ? "Regenerating landing page content"
        : "Generating landing page content",
    });

    await this.generateContent(
      "webserver:landing",
      {
        prompt: `Create a landing page for "${this.options.siteTitle}" - ${this.options.siteDescription}`,
        context: {
          siteTitle: this.options.siteTitle,
          siteDescription: this.options.siteDescription,
          siteUrl: this.options.siteUrl,
          generalContext, // Pass general context
        },
        force,
      },
      sendProgress,
    );

    // Step 3: Generate dashboard
    await sendProgress?.({
      progress: ++currentStep,
      total: totalSteps,
      message: force
        ? "Regenerating dashboard content"
        : "Generating dashboard content",
    });
    await this.generateDashboard(sendProgress, force);

    // Step 4: Complete
    await sendProgress?.({
      progress: ++currentStep,
      total: totalSteps,
      message: "Content generation complete",
    });
    // Future: generateNotePages(), generateArticlePages(), etc.
  }
}
