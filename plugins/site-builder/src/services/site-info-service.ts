import type { IEntityService } from "@brains/entity-service";
import type { Logger } from "@brains/utils";
import type { SiteInfoEntity, SiteInfoBody } from "./site-info-schema";
import { SiteInfoAdapter } from "./site-info-adapter";

/**
 * Site Info Service
 * Caches and provides the site's information (title, description, CTA, etc.)
 */
export class SiteInfoService {
  private static instance: SiteInfoService | null = null;
  private cache: SiteInfoEntity | null = null;
  private logger: Logger;
  private entityService: IEntityService;
  private adapter: SiteInfoAdapter;
  private defaultSiteInfo: SiteInfoBody;

  /**
   * Get the default site info for a new site
   */
  public static getDefaultSiteInfo(): SiteInfoBody {
    return {
      title: "Personal Brain",
      description: "A knowledge management system",
    };
  }

  /**
   * Get the singleton instance
   */
  public static getInstance(
    entityService: IEntityService,
    logger: Logger,
    defaultSiteInfo?: Partial<SiteInfoBody>,
  ): SiteInfoService {
    SiteInfoService.instance ??= new SiteInfoService(
      entityService,
      logger,
      defaultSiteInfo,
    );
    return SiteInfoService.instance;
  }

  /**
   * Reset the singleton instance (for testing)
   */
  public static resetInstance(): void {
    SiteInfoService.instance = null;
  }

  /**
   * Create a fresh instance without affecting singleton
   */
  public static createFresh(
    entityService: IEntityService,
    logger: Logger,
    defaultSiteInfo?: Partial<SiteInfoBody>,
  ): SiteInfoService {
    return new SiteInfoService(entityService, logger, defaultSiteInfo);
  }

  /**
   * Private constructor to enforce factory methods
   */
  private constructor(
    entityService: IEntityService,
    logger: Logger,
    defaultSiteInfo?: Partial<SiteInfoBody>,
  ) {
    this.entityService = entityService;
    this.logger = logger.child("SiteInfoService");
    this.adapter = new SiteInfoAdapter();

    // Merge provided defaults with fallback defaults
    const defaults = SiteInfoService.getDefaultSiteInfo();
    this.defaultSiteInfo = {
      ...defaults,
      ...defaultSiteInfo,
    };
  }

  /**
   * Initialize the service and load site info into cache
   * Creates a default site info if none exists
   */
  public async initialize(): Promise<void> {
    await this.loadSiteInfo();

    // If no site info exists, create one with default values
    if (!this.cache) {
      this.logger.info("No site info found, creating default site info");
      try {
        const content = this.adapter.createSiteInfoContent(
          this.defaultSiteInfo,
        );

        await this.entityService.createEntity({
          id: "site-info",
          entityType: "site-info",
          content,
        });

        // Reload the cache with the newly created entity
        await this.loadSiteInfo();
        this.logger.info("Default site info created successfully");
      } catch (error) {
        this.logger.error("Failed to create default site info", { error });
      }
    }
  }

  /**
   * Get the site info data (from cache or default)
   */
  public getSiteInfo(): SiteInfoBody {
    if (this.cache) {
      return this.adapter.parseSiteInfoBody(this.cache.content);
    }
    return this.defaultSiteInfo;
  }

  /**
   * Refresh the site info cache from database
   */
  public async refreshCache(): Promise<void> {
    await this.loadSiteInfo();
  }

  /**
   * Load site info from database into cache
   */
  private async loadSiteInfo(): Promise<void> {
    try {
      const siteInfo = (await this.entityService.getEntity(
        "site-info",
        "site-info",
      )) as SiteInfoEntity | null;

      this.cache = siteInfo;

      if (siteInfo) {
        const siteInfoData = this.adapter.parseSiteInfoBody(siteInfo.content);
        this.logger.debug("Site info loaded", {
          title: siteInfoData.title,
          hasCTA: !!siteInfoData.cta,
        });
      } else {
        this.logger.debug("No site info found in database");
      }
    } catch (error) {
      this.logger.warn("Failed to load site info", { error });
      this.cache = null;
    }
  }
}
