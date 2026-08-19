import type { IEntityService } from "@brains/entity-service";
import type { Logger } from "@brains/utils/logger";
import type { AnchorProfile } from "./anchor-profile-schema";
import { AnchorProfileAdapter } from "./anchor-profile-adapter";
import { SingletonDocumentService } from "./singleton-document-service";

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
  extends SingletonDocumentService<AnchorProfile>
  implements IAnchorProfileService
{
  /**
   * Get the default profile for a new brain
   */
  public static getDefaultProfile(): AnchorProfile {
    return { name: "Unknown" };
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
    const adapter = new AnchorProfileAdapter();
    super(
      entityService,
      logger,
      "anchor-profile",
      defaultProfile ?? AnchorProfileService.getDefaultProfile(),
      "anchor profile is loaded at bootstrap before any user is in scope",
      {
        parse: (content) => adapter.parseProfileBody(content),
        create: (body) => adapter.createProfileContent(body),
      },
    );
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
