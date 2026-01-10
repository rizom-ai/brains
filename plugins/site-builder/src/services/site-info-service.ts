import type { IEntityService } from "@brains/plugins";
import type { Logger } from "@brains/utils";
import type { SiteInfoEntity, SiteInfoBody } from "./site-info-schema";
import { SiteInfoAdapter } from "./site-info-adapter";

/**
 * Site Info Service
 * Provides the site's information (title, description, CTA, etc.)
 */
export class SiteInfoService {
  private static instance: SiteInfoService | null = null;
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
   * Initialize the service
   * Creates a default site info if none exists
   */
  public async initialize(): Promise<void> {
    try {
      const siteInfo = (await this.entityService.getEntity(
        "site-info",
        "site-info",
      )) as SiteInfoEntity | null;

      // If no site info exists, create one with default values
      if (!siteInfo) {
        this.logger.info("No site info found, creating default site info");
        const content = this.adapter.createSiteInfoContent(
          this.defaultSiteInfo,
        );

        await this.entityService.createEntity({
          id: "site-info",
          entityType: "site-info",
          content,
          metadata: {},
        });

        this.logger.info("Default site info created successfully");
      }
    } catch (error) {
      this.logger.error("Failed to initialize site info", { error });
    }
  }

  /**
   * Get the site info data (from database or default)
   * Always loads fresh from database to ensure consistency
   */
  public async getSiteInfo(): Promise<SiteInfoBody> {
    try {
      // Always load fresh from database to avoid stale cache issues
      const siteInfo = await this.entityService.getEntity<SiteInfoEntity>(
        "site-info",
        "site-info",
      );

      if (siteInfo) {
        return this.adapter.parseSiteInfoBody(siteInfo.content);
      }
    } catch (error) {
      this.logger.debug("Site info not found, using defaults", { error });
    }
    return this.defaultSiteInfo;
  }
}
