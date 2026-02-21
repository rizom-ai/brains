import type { IEntityService } from "@brains/entity-service";
import { SingletonEntityService } from "@brains/entity-service";
import type { Logger } from "@brains/utils";
import type { ProfileBody } from "./schema";
import { ProfileAdapter } from "./adapter";

/**
 * Profile Service
 * Provides the person/organization's public profile (name, bio, socialLinks)
 */
export class ProfileService extends SingletonEntityService<ProfileBody> {
  private static instance: ProfileService | null = null;
  private adapter = new ProfileAdapter();

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
    super(
      entityService,
      logger,
      "profile",
      defaultProfile ?? ProfileService.getDefaultProfile(),
    );
  }

  protected parseBody(content: string): ProfileBody {
    return this.adapter.parseProfileBody(content);
  }

  protected createContent(body: ProfileBody): string {
    return this.adapter.createProfileContent(body);
  }

  /**
   * Get the profile data (from cache or default)
   */
  public getProfile(): ProfileBody {
    return this.get();
  }

  /**
   * Get the raw profile content (markdown)
   */
  public getProfileContent(): string {
    return this.getContent();
  }
}
