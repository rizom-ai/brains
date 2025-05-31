import type { Registry, EntityService, BaseEntity } from "@brains/types";
import { Logger } from "@brains/utils";
import { join } from "path";
import { existsSync, mkdirSync } from "fs";
import { writeFile } from "fs/promises";
import * as yaml from "js-yaml";

export interface ContentGeneratorOptions {
  logger: Logger;
  registry: Registry;
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
  private options: ContentGeneratorOptions;
  private contentDir: string;

  constructor(options: ContentGeneratorOptions) {
    this.logger = options.logger;
    this.registry = options.registry;
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
    data: unknown
  ): Promise<void> {
    const filePath = join(this.contentDir, collection, filename);
    const yamlContent = yaml.dump(data);
    await writeFile(filePath, yamlContent);
    this.logger.debug(`Wrote ${filePath}`);
  }

  /**
   * Generate landing page data from brain content
   */
  async generateLandingPage(): Promise<void> {
    this.logger.info("Generating landing page data");

    // EntityService is resolved from the registry
    const entityService = this.registry.resolve<EntityService>("entityService");

    // Get statistics
    const notes = await entityService.listEntities<BaseEntity>("note", { limit: 1000 });
    const allTags = new Set<string>();
    
    // Collect all unique tags
    notes.forEach(note => {
      note.tags.forEach(tag => allTags.add(tag));
    });

    // Get recent notes for display
    const recentNotes = notes
      .sort((a, b) => new Date(b.updated).getTime() - new Date(a.updated).getTime())
      .slice(0, 5)
      .map(note => ({
        id: note.id,
        title: note.title,
        created: note.created,
      }));

    // Create landing page data
    const landingData = {
      title: this.options.siteTitle,
      description: this.options.siteDescription,
      stats: {
        noteCount: notes.length,
        tagCount: allTags.size,
        lastUpdated: new Date().toISOString(),
      },
      recentNotes,
    };

    // Write to landing collection
    await this.writeYamlFile("landing", "site.yaml", landingData);

    this.logger.info("Landing page data generated", {
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
      const siteContent = await entityService.listEntities<BaseEntity>("site-content", { limit: 1 });
      return siteContent.length > 0;
    } catch (error) {
      // Entity type might not exist yet
      return false;
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
    // Future: generateNotePages(), generateArticlePages(), etc.
  }
}