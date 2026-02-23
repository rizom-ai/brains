import type { IEntityService } from "@brains/entity-service";
import { SingletonEntityService } from "@brains/entity-service";
import type { Logger } from "@brains/utils";
import type { AnchorProfile } from "./anchor-profile-schema";
import { AnchorProfileAdapter } from "./anchor-profile-adapter";

/**
 * Interface for consuming the anchor's profile data
 * Use this in consumers instead of the concrete class
 */
export interface IAnchorProfileService {
  getProfile(): AnchorProfile;
}

/**
 * Anchor Profile Service
 * Provides the person/organization's public profile (name, bio, socialLinks)
 */
export class AnchorProfileService
  extends SingletonEntityService<AnchorProfile>
  implements IAnchorProfileService
{
  private static instance: AnchorProfileService | null = null;
  private adapter = new AnchorProfileAdapter();

  /**
   * Get the default profile for a new brain
   */
  public static getDefaultProfile(): AnchorProfile {
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
    defaultProfile?: AnchorProfile,
  ): AnchorProfileService {
    AnchorProfileService.instance ??= new AnchorProfileService(
      entityService,
      logger,
      defaultProfile,
    );
    return AnchorProfileService.instance;
  }

  /**
   * Reset the singleton instance (for testing)
   */
  public static resetInstance(): void {
    AnchorProfileService.instance = null;
  }

  /**
   * Create a fresh instance without affecting singleton
   */
  public static createFresh(
    entityService: IEntityService,
    logger: Logger,
    defaultProfile?: AnchorProfile,
  ): AnchorProfileService {
    return new AnchorProfileService(entityService, logger, defaultProfile);
  }

  /**
   * Private constructor to enforce factory methods
   */
  private constructor(
    entityService: IEntityService,
    logger: Logger,
    defaultProfile?: AnchorProfile,
  ) {
    super(
      entityService,
      logger,
      "anchor-profile",
      defaultProfile ?? AnchorProfileService.getDefaultProfile(),
    );
  }

  protected parseBody(content: string): AnchorProfile {
    return this.adapter.parseProfileBody(content);
  }

  protected createContent(body: AnchorProfile): string {
    return this.adapter.createProfileContent(body);
  }

  /**
   * Get the profile data (from cache or default)
   */
  public getProfile(): AnchorProfile {
    return this.get();
  }

  /**
   * Get the raw profile content (markdown)
   */
  public getProfileContent(): string {
    return this.getContent();
  }
}
