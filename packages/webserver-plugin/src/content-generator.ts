import type { BaseEntity, PluginContext } from "@brains/types";
import type { SiteContent } from "./schemas";
import { z } from "zod";
import type { DashboardData } from "./content/dashboard/index/schema";
import type { LandingHeroData } from "./content/landing/hero/schema";
import type { FeaturesSection } from "./content/landing/features/schema";
import type { CTASection } from "./content/landing/cta/schema";
import type { Logger } from "@brains/utils";
import { generateWithTemplate } from "@brains/utils";
import { join } from "path";
import { contentRegistry } from "./content";
import { existsSync, mkdirSync } from "fs";
import { writeFile } from "fs/promises";
import * as yaml from "js-yaml";
import { getDefaultContentFormatter } from "@brains/formatters";

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
    const filePath = join(this.contentDir, collection, filename);
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
   * Generate landing page data using query processor
   */
  async generateLandingPage(
    sendProgress?: (notification: {
      progress: number;
      total?: number;
      message?: string;
    }) => Promise<void>,
    force = false,
  ): Promise<void> {
    this.logger.info("Generating landing page data");

    // Check for existing sections individually
    const existingHero = await this.getExistingSiteContent<LandingHeroData>("landing", "hero");
    const existingFeatures = await this.getExistingSiteContent<FeaturesSection>(
      "landing",
      "features",
    );
    const existingCta = await this.getExistingSiteContent<CTASection>("landing", "cta");

    // Get the landing page schema from registry for validation
    const landingTemplate = contentRegistry.getTemplate("landing:index");
    if (!landingTemplate) {
      throw new Error("Landing page template not found in registry");
    }
    type LandingPageData = z.infer<typeof landingTemplate.schema>;

    let landingData: LandingPageData | undefined;
    let validExistingContent = false;

    // If all sections exist and not forcing regeneration, use them to assemble the landing page
    if (!force && existingHero && existingFeatures && existingCta) {
      try {
        landingData = {
          title: this.options.siteTitle,
          tagline: this.options.siteDescription,
          hero: existingHero as any,
          features: existingFeatures as any,
          cta: existingCta as any,
        };

        // Validate the assembled data
        const validation = landingTemplate.schema.safeParse(landingData);
        if (validation.success) {
          this.logger.info("Using existing sections to assemble landing page");
          landingData = validation.data;
          validExistingContent = true;
        } else {
          this.logger.warn(
            "Existing sections do not form valid landing page data",
            {
              errors: validation.error.errors,
            },
          );
        }
      } catch (error) {
        this.logger.warn(
          "Error assembling landing page from existing sections",
          error,
        );
      }
    } else {
      this.logger.info("Will generate missing sections", {
        force,
        hasHero: !!existingHero,
        hasFeatures: !!existingFeatures,
        hasCta: !!existingCta,
      });
    }

    if (!validExistingContent) {
      this.logger.info("Generating landing page content");

      // Generate sections separately
      const baseContext = {
        siteTitle: this.options.siteTitle,
        siteDescription: this.options.siteDescription,
      };

      let heroData = existingHero;
      let featuresData = existingFeatures;
      let ctaData = existingCta;
      let currentStep = 0;
      const totalSteps = 4;

      // Generate hero section if missing or forced
      if (!heroData || force) {
        await sendProgress?.({
          progress: ++currentStep,
          total: totalSteps,
          message: force && heroData ? "Regenerating hero section" : "Generating hero section",
        });
        const heroTemplate = contentRegistry.getTemplate("landing:hero");
        if (!heroTemplate) {
          throw new Error("Hero template not found in registry");
        }
        heroData = await generateWithTemplate<z.infer<typeof heroTemplate.schema>>(
          this.context.generateContent.bind(this.context),
          heroTemplate,
          "landing:hero",
          {
            prompt: `Generate hero section for "${this.options.siteTitle}" - ${this.options.siteDescription}`,
            data: baseContext,
          },
        );

        // Format the content using the registered formatter or default
        const heroFormatter = this.context.contentTypeRegistry.getFormatter(
          "webserver:landing:hero",
        );
        const formattedHeroContent = heroFormatter
          ? heroFormatter.format(heroData)
          : getDefaultContentFormatter().format(heroData);

        // Save as site-content entity with formatted content
        await this.context.entityService.createEntity<SiteContent>({
          entityType: "site-content",
          content: formattedHeroContent,
          page: "landing",
          section: "hero",
          environment: "preview", // Always generate to preview
        });

        this.logger.debug("Generated hero data:", {
          hasData: !!heroData,
          heroData,
        });
      } else {
        currentStep++;
      }

      // Generate features section if missing or forced
      if (!featuresData || force) {
        await sendProgress?.({
          progress: ++currentStep,
          total: totalSteps,
          message: force && featuresData ? "Regenerating features section" : "Generating features section",
        });

        try {
          const featuresTemplate =
            contentRegistry.getTemplate("landing:features");
          if (!featuresTemplate) {
            throw new Error("Features template not found in registry");
          }
          featuresData = await generateWithTemplate<z.infer<typeof featuresTemplate.schema>>(
            this.context.generateContent.bind(this.context),
            featuresTemplate,
            "landing:features",
            {
              prompt: `Generate features section for "${this.options.siteTitle}" - ${this.options.siteDescription}`,
              data: baseContext,
            },
          );

        this.logger.debug("Generated features data:", {
          hasData: !!featuresData,
          features: featuresData!.features.length || 0,
          rawData: JSON.stringify(featuresData, null, 2),
        });

        // Validate the features data
        if (featuresTemplate) {
          const validation = featuresTemplate.schema.safeParse(featuresData);
          if (!validation.success) {
            this.logger.error("Features validation failed", {
              errors: validation.error.errors,
              data: featuresData,
              featuresArray: featuresData!.features,
              firstFeature: featuresData!.features[0],
              featuresType: Array.isArray(featuresData!.features)
                ? "array"
                : typeof featuresData!.features,
              firstFeatureType: typeof featuresData!.features[0],
            });
          }
        }

        // Format the content using the registered formatter or default
        const featuresFormatter = this.context.contentTypeRegistry.getFormatter(
          "webserver:landing:features",
        );
        const formattedFeaturesContent = featuresFormatter
          ? featuresFormatter.format(featuresData)
          : getDefaultContentFormatter().format(featuresData);

        // Save as site-content entity with formatted content
        await this.context.entityService.createEntity<SiteContent>({
          entityType: "site-content",
          content: formattedFeaturesContent,
          page: "landing",
          section: "features",
          environment: "preview", // Always generate to preview
        });
        } catch (error) {
          this.logger.error("Failed to generate features section", error);
          throw error;
        }
      } else {
        currentStep++;
      }

      // Generate CTA section if missing or forced
      if (!ctaData || force) {
        await sendProgress?.({
          progress: ++currentStep,
          total: totalSteps,
          message: force && ctaData ? "Regenerating CTA section" : "Generating CTA section",
        });
        const ctaTemplate = contentRegistry.getTemplate("landing:cta");
        if (!ctaTemplate) {
          throw new Error("CTA template not found in registry");
        }
        ctaData = await generateWithTemplate<z.infer<typeof ctaTemplate.schema>>(
          this.context.generateContent.bind(this.context),
          ctaTemplate,
          "landing:cta",
          {
            prompt: `Generate CTA section for "${this.options.siteTitle}" - ${this.options.siteDescription}`,
            data: baseContext,
          },
        );

        // Format the content using the registered formatter or default
        const ctaFormatter = this.context.contentTypeRegistry.getFormatter(
          "webserver:landing:cta",
        );
        const formattedCtaContent = ctaFormatter
          ? ctaFormatter.format(ctaData)
          : getDefaultContentFormatter().format(ctaData);

        // Save as site-content entity with formatted content
        await this.context.entityService.createEntity<SiteContent>({
          entityType: "site-content",
          content: formattedCtaContent,
          page: "landing",
          section: "cta",
          environment: "preview", // Always generate to preview
        });
      } else {
        currentStep++;
      }

      // Update progress for final step
      await sendProgress?.({
        progress: ++currentStep,
        total: totalSteps,
        message: "Assembling landing page data",
      });

      // Assemble full landing page data
      // All data is guaranteed to be non-null here due to generateWithTemplate
      landingData = {
        title: this.options.siteTitle,
        tagline: this.options.siteDescription,
        hero: heroData,
        features: featuresData,
        cta: ctaData,
      };

      this.logger.debug("Assembled landing page data", {
        hasHero: true,
        hasFeatures: true,
        featuresCount: featuresData!.features.length || 0,
        hasCta: true,
      });
    }

    if (!landingData) {
      throw new Error("Failed to generate landing page data");
    }

    // Validate final data before writing
    const finalValidation = landingTemplate.schema.safeParse(landingData);
    if (!finalValidation.success) {
      this.logger.error("Generated landing page data is invalid", {
        errors: finalValidation.error.errors,
      });
      throw new Error("Failed to generate valid landing page data");
    }

    // Write to landing collection for Astro to consume
    this.logger.debug("Writing landing page data to YAML", {
      hasTitle: !!landingData.title,
      hasTagline: !!landingData.tagline,
      hasHero: !!landingData.hero,
      hasFeatures: !!landingData.features,
      featuresCount: landingData.features.features.length,
      hasCta: !!landingData.cta,
    });

    await this.writeYamlFile("landing", "index.yaml", landingData);

    this.logger.info("Landing page data generated");
  }

  /**
   * Generate dashboard data from brain content
   */
  async generateDashboard(
    _sendProgress?: (notification: {
      progress: number;
      total?: number;
      message?: string;
    }) => Promise<void>,
    force = false,
  ): Promise<void> {
    this.logger.info("Generating dashboard data");

    // Check for existing dashboard content
    if (!force) {
      const existingDashboard = await this.getExistingSiteContent("dashboard", "index");
      if (existingDashboard) {
        this.logger.info("Dashboard content already exists, skipping generation");
        return;
      }
    }

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

    // Get dashboard schema from registry
    const dashboardTemplate = contentRegistry.getTemplate("dashboard:index");
    if (!dashboardTemplate) {
      throw new Error("Dashboard template not found in registry");
    }

    // Validate data against schema
    const validatedData = dashboardTemplate.schema.parse(dashboardData);

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
  async getExistingSiteContent<T = unknown>(
    page: string,
    section: string,
  ): Promise<T | null> {
    const entityService = this.context.entityService;

    // Create a content type and add the plugin namespace for querying
    const contentType = `${page}:${section}`;
    const namespacedContentType = `${this.context.pluginId}:${contentType}`;

    try {
      // Look for site-content entities with matching page and section in preview environment
      const results = await entityService.listEntities<SiteContent>(
        "site-content",
        {
          filter: {
            metadata: { page, section, environment: "preview" },
          },
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

      // Parse the formatted content back to structured data using the formatter
      const formatter = this.context.contentTypeRegistry.getFormatter<T>(
        namespacedContentType,
      );
      if (formatter && formatter.parse) {
        try {
          return formatter.parse(matchingContent.content);
        } catch (error) {
          this.logger.warn("Failed to parse existing content", {
            contentType: namespacedContentType,
            error,
          });
          return null;
        }
      }

      return null;
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

    // Generate content with progress notifications
    await sendProgress?.({
      progress: 1,
      total: 3,
      message: force ? "Regenerating landing page content" : "Generating landing page content",
    });
    await this.generateLandingPage(sendProgress, force);

    await sendProgress?.({
      progress: 2,
      total: 3,
      message: force ? "Regenerating dashboard content" : "Generating dashboard content",
    });
    await this.generateDashboard(sendProgress, force);

    await sendProgress?.({
      progress: 3,
      total: 3,
      message: "Content generation complete",
    });
    // Future: generateNotePages(), generateArticlePages(), etc.
  }

  /**
   * Generate content for a specific section
   */
  async generateSection(
    templateKey: string,
    environment: "preview" | "production",
    force = false,
    sendProgress?: (notification: {
      progress: number;
      total?: number;
      message?: string;
    }) => Promise<void>,
  ): Promise<{ generated: boolean }> {
    // Only allow generation to preview environment
    if (environment !== "preview") {
      throw new Error("Content can only be generated to preview environment");
    }

    const parts = templateKey.split(":");
    if (parts.length !== 2) {
      throw new Error(`Invalid template key format: ${templateKey}. Expected format: page:section`);
    }
    const [page, section] = parts as [string, string];
    
    // Check if content already exists
    if (!force) {
      const existing = await this.getExistingSiteContent(page, section);
      if (existing) {
        this.logger.info(`Content already exists for ${page}:${section}, skipping`);
        return { generated: false };
      }
    }

    // Get template from registry
    const template = contentRegistry.getTemplate(templateKey);
    if (!template) {
      throw new Error(`Template not found: ${templateKey}`);
    }

    // Generate content
    await sendProgress?.({
      progress: 1,
      total: 1,
      message: `Generating ${templateKey}`,
    });

    const baseContext = {
      siteTitle: this.options.siteTitle,
      siteDescription: this.options.siteDescription,
      siteUrl: this.options.siteUrl || "https://example.com",
    };

    const data = await generateWithTemplate<z.infer<typeof template.schema>>(
      this.context.generateContent.bind(this.context),
      template,
      templateKey,
      {
        prompt: `Generate ${section} section for "${this.options.siteTitle}" - ${this.options.siteDescription}`,
        data: baseContext,
      },
    );

    // Format the content
    const namespacedContentType = `${this.context.pluginId}:${templateKey}`;
    const formatter = this.context.contentTypeRegistry.getFormatter(namespacedContentType);
    const formattedContent = formatter
      ? formatter.format(data)
      : getDefaultContentFormatter().format(data);

    // Save as site-content entity
    await this.context.entityService.createEntity<SiteContent>({
      entityType: "site-content",
      content: formattedContent,
      page,
      section,
      environment: "preview",
    });

    this.logger.info(`Generated content for ${page}:${section}`);
    return { generated: true };
  }

  /**
   * Write content from a specific environment to YAML files for Astro
   */
  async writeContentForEnvironment(
    environment: "preview" | "production",
    sendProgress?: (notification: {
      progress: number;
      total?: number;
      message?: string;
    }) => Promise<void>,
  ): Promise<void> {
    this.logger.info(`Writing content for ${environment} environment`);

    // Ensure directories exist
    await this.initialize();

    // Write landing page content
    await sendProgress?.({
      progress: 1,
      total: 3,
      message: `Writing ${environment} landing page content`,
    });
    await this.writeLandingPageForEnvironment(environment);

    // Write dashboard content
    await sendProgress?.({
      progress: 2,
      total: 3,
      message: `Writing ${environment} dashboard content`,
    });
    await this.writeDashboardForEnvironment(environment);

    await sendProgress?.({
      progress: 3,
      total: 3,
      message: `Content writing complete for ${environment}`,
    });
  }

  /**
   * Write landing page content for a specific environment
   */
  private async writeLandingPageForEnvironment(
    environment: "preview" | "production",
  ): Promise<void> {
    // Get sections from the specified environment
    const hero = await this.getExistingSiteContentForEnvironment(
      "landing",
      "hero",
      environment,
    );
    const features = await this.getExistingSiteContentForEnvironment(
      "landing",
      "features",
      environment,
    );
    const cta = await this.getExistingSiteContentForEnvironment(
      "landing",
      "cta",
      environment,
    );

    if (!hero || !features || !cta) {
      this.logger.warn(
        `Missing landing page sections for ${environment} environment`,
        {
          hasHero: !!hero,
          hasFeatures: !!features,
          hasCta: !!cta,
        },
      );
      return;
    }

    // Assemble landing page data
    const landingData = {
      title: this.options.siteTitle,
      tagline: this.options.siteDescription,
      hero,
      features,
      cta,
    };

    // Write to YAML
    await this.writeYamlFile("landing", "index.yaml", landingData);
    this.logger.info(`Landing page written for ${environment} environment`);
  }

  /**
   * Write dashboard content for a specific environment
   */
  private async writeDashboardForEnvironment(
    _environment: "preview" | "production",
  ): Promise<void> {
    // For dashboard, we generate fresh data from entities
    // This is the same for both environments as it reflects current state
    await this.generateDashboard();
  }

  /**
   * Get existing site content for a specific environment
   */
  private async getExistingSiteContentForEnvironment<T = unknown>(
    page: string,
    section: string,
    environment: "preview" | "production",
  ): Promise<T | null> {
    const entityService = this.context.entityService;

    try {
      const results = await entityService.listEntities<SiteContent>(
        "site-content",
        {
          filter: {
            metadata: { page, section, environment },
          },
          limit: 1,
          sortBy: "updated",
          sortDirection: "desc",
        },
      );

      if (results.length === 0) {
        return null;
      }

      const matchingContent = results[0];
      if (!matchingContent) {
        return null;
      }

      // Parse the formatted content back to structured data
      const contentType = `${page}:${section}`;
      const namespacedContentType = `${this.context.pluginId}:${contentType}`;
      const formatter = this.context.contentTypeRegistry.getFormatter<T>(
        namespacedContentType,
      );

      if (formatter && formatter.parse) {
        try {
          return formatter.parse(matchingContent.content);
        } catch (error) {
          this.logger.warn("Failed to parse content", {
            contentType: namespacedContentType,
            environment,
            error,
          });
          return null;
        }
      }

      return null;
    } catch (error) {
      this.logger.debug("Error looking for content", {
        page,
        section,
        environment,
        error,
      });
      return null;
    }
  }
}
