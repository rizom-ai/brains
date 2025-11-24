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
   * Initialize the service
   * Creates a default profile if none exists
   */
  public async initialize(): Promise<void> {
    try {
      const profile = await this.entityService.getEntity<ProfileEntity>(
        "profile",
        "profile",
      );

      // If no profile exists, create one with default values
      if (!profile) {
        this.logger.info("No profile found, creating default profile");
        const content = this.adapter.createProfileContent(this.defaultProfile);

        await this.entityService.createEntity({
          id: "profile",
          entityType: "profile",
          content,
          metadata: {},
        });

        this.logger.info("Default profile created successfully");
      }
    } catch (error) {
      this.logger.error("Failed to initialize profile", { error });
    }
  }

  /**
   * Get the profile data (from database or default)
   * Always loads fresh from database to ensure consistency
   */
  public async getProfile(): Promise<ProfileBody> {
    try {
      // Always load fresh from database to avoid stale cache issues
      const profile = await this.entityService.getEntity<ProfileEntity>(
        "profile",
        "profile",
      );

      if (profile) {
        return this.adapter.parseProfileBody(profile.content);
      }
    } catch (error) {
      this.logger.debug("Profile not found, using defaults", { error });
    }
    return this.defaultProfile;
  }
}
