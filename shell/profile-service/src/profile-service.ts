import type { IEntityService } from "@brains/entity-service";
import type { Logger } from "@brains/utils";
import type { ProfileEntity, ProfileBody } from "./schema";
import { ProfileAdapter } from "./adapter";

/**
 * Profile Service
 * Provides the person/organization's public profile (name, bio, socialLinks)
 */
export class ProfileService {
  private static instance: ProfileService | null = null;
  private cache: ProfileEntity | null = null;
  private logger: Logger;
  private entityService: IEntityService;
  private adapter: ProfileAdapter;
  private defaultProfile: ProfileBody;

  /**
   * Get the default profile for a new brain
   */
  public static getDefaultProfile(): ProfileBody {
    return {
      name: "Unknown",
    };
  }

  /**
   * Get the singleton instance
   */
  public static getInstance(
    entityService: IEntityService,
    logger: Logger,
    defaultProfile?: ProfileBody,
  ): ProfileService {
    ProfileService.instance ??= new ProfileService(
      entityService,
      logger,
      defaultProfile,
    );
    return ProfileService.instance;
  }

  /**
   * Reset the singleton instance (for testing)
   */
  public static resetInstance(): void {
    ProfileService.instance = null;
  }

  /**
   * Create a fresh instance without affecting singleton
   */
  public static createFresh(
    entityService: IEntityService,
    logger: Logger,
    defaultProfile?: ProfileBody,
  ): ProfileService {
    return new ProfileService(entityService, logger, defaultProfile);
  }

  /**
   * Private constructor to enforce factory methods
   */
  private constructor(
    entityService: IEntityService,
    logger: Logger,
    defaultProfile?: ProfileBody,
  ) {
    this.entityService = entityService;
    this.logger = logger.child("ProfileService");
    this.adapter = new ProfileAdapter();
    this.defaultProfile = defaultProfile ?? ProfileService.getDefaultProfile();
  }

  /**
   * Initialize the service and load profile into cache
   * Creates a default profile if none exists
   */
  public async initialize(): Promise<void> {
    await this.loadProfile();

    // If no profile exists, create one with default values
    if (!this.cache) {
      this.logger.info("No profile found, creating default profile");
      try {
        const content = this.adapter.createProfileContent(this.defaultProfile);

        await this.entityService.createEntity({
          id: "profile",
          entityType: "profile",
          content,
          metadata: {},
        });

        // Reload the cache with the newly created entity
        await this.loadProfile();
        this.logger.info("Default profile created successfully");
      } catch (error) {
        this.logger.error("Failed to create default profile", { error });
      }
    }
  }

  /**
   * Get the profile data (from cache or default)
   */
  public getProfile(): ProfileBody {
    if (this.cache) {
      return this.adapter.parseProfileBody(this.cache.content);
    }
    return this.defaultProfile;
  }

  /**
   * Get the raw profile content (markdown)
   */
  public getProfileContent(): string {
    if (this.cache) {
      return this.cache.content;
    }
    return this.adapter.createProfileContent(this.defaultProfile);
  }

  /**
   * Refresh the profile cache from database
   */
  public async refreshCache(): Promise<void> {
    await this.loadProfile();
  }

  /**
   * Load profile from database into cache
   */
  private async loadProfile(): Promise<void> {
    try {
      const profile = await this.entityService.getEntity<ProfileEntity>(
        "profile",
        "profile",
      );

      this.cache = profile;

      if (profile) {
        const profileData = this.adapter.parseProfileBody(profile.content);
        this.logger.debug("Profile loaded", {
          name: profileData.name,
        });
      } else {
        this.logger.debug("No profile found in database");
      }
    } catch (error) {
      this.logger.warn("Failed to load profile", { error });
      this.cache = null;
    }
  }
}
