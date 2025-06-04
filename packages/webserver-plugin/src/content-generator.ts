import type {
  Registry,
  EntityService,
  BaseEntity,
  PluginContext,
} from "@brains/types";
import {
  landingPageSchema,
  dashboardSchema,
  type DashboardData,
  type LandingPageData,
} from "./content-schemas";
import type { SiteContent } from "./schemas";
import type { Logger } from "@brains/utils";
import { join } from "path";
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
      // Use the schema to get structured landing page content
      const query = `Generate content for the landing page of ${this.options.siteTitle}. 
      Create an engaging headline, tagline, and call-to-action based on the notes and knowledge in this brain.`;

      // Use the plugin context's query method
      // Avoid the type inference issue by not specifying the generic parameter
      const queryResult = await this.context.query(query, landingPageSchema);
      // TypeScript knows this matches LandingPageData from the schema
      landingData = queryResult;
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

    // Get statistics
    // For now, we'll use base entities since note entity type may not be registered
    const notes = await entityService.listEntities<BaseEntity>("base", {
      limit: 1000,
    });
    const allTags = new Set<string>();

    // Collect all unique tags
    notes.forEach((note) => {
      note.tags.forEach((tag) => allTags.add(tag));
    });

    // Get recent notes for display
    const recentNotes = notes
      .sort(
        (a, b) => new Date(b.updated).getTime() - new Date(a.updated).getTime(),
      )
      .slice(0, 5)
      .map((note) => ({
        id: note.id,
        title: note.title,
        created: note.created,
      }));

    // Create dashboard data
    const dashboardData: DashboardData = {
      title: this.options.siteTitle,
      description: this.options.siteDescription,
      stats: {
        noteCount: notes.length,
        tagCount: allTags.size,
        lastUpdated: new Date().toISOString(),
      },
      recentNotes,
    };

    // Validate data against schema
    const validatedData = dashboardSchema.parse(dashboardData);

    // Write to dashboard collection
    await this.writeYamlFile("dashboard", "index.yaml", validatedData);

    this.logger.info("Dashboard data generated", {
      noteCount: notes.length,
      tagCount: allTags.size,
    });
  }

  /**
   * Check if site-content entities exist for enhanced content
   */
  async checkForSiteContent(): Promise<boolean> {
    // EntityService is resolved from the registry
    const entityService = this.registry.resolve<EntityService>("entityService");

    try {
      const siteContent = await entityService.listEntities<BaseEntity>(
        "site-content",
        { limit: 1 },
      );
      return siteContent.length > 0;
    } catch {
      // Entity type might not exist yet
      return false;
    }
  }

  /**
   * Get existing site content for a specific page and section
   * Uses a predictable title format: "landing:hero"
   */
  async getExistingSiteContent(
    page: string,
    section: string,
  ): Promise<unknown | null> {
    const entityService = this.registry.resolve<EntityService>("entityService");

    // Create a unique, predictable title for this content
    const contentTitle = `${page}:${section}`;

    try {
      // Use the new filter capability to query by title
      const results = await entityService.listEntities<SiteContent>(
        "site-content",
        {
          filter: { title: contentTitle },
          limit: 1,
        },
      );

      if (results.length === 0) {
        this.logger.debug("No existing site content found", {
          title: contentTitle,
        });
        return null;
      }

      const matchingContent = results[0];
      if (!matchingContent) {
        return null;
      }
      this.logger.info("Found existing site content", { title: contentTitle });
      return matchingContent.data || null;
    } catch (error) {
      this.logger.debug("Error looking for site content", {
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
