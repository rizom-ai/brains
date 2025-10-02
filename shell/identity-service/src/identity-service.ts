import type { IEntityService } from "@brains/entity-service";
import type { Logger } from "@brains/utils";
import type { IdentityEntity, IdentityBody } from "./schema";
import { IdentityAdapter } from "./adapter";

/**
 * Identity Service
 * Caches and provides the brain's identity (role, purpose, values)
 */
export class IdentityService {
  private static instance: IdentityService | null = null;
  private cache: IdentityEntity | null = null;
  private logger: Logger;
  private entityService: IEntityService;
  private adapter: IdentityAdapter;
  private defaultIdentity: IdentityBody;

  /**
   * Get the default identity for a new brain
   */
  public static getDefaultIdentity(): IdentityBody {
    return {
      name: "Personal Brain",
      role: "Personal knowledge assistant",
      purpose:
        "Help organize, understand, and retrieve information from your personal knowledge base",
      values: ["clarity", "accuracy", "helpfulness"],
    };
  }

  /**
   * Get the singleton instance
   */
  public static getInstance(
    entityService: IEntityService,
    logger: Logger,
    defaultIdentity?: IdentityBody,
  ): IdentityService {
    IdentityService.instance ??= new IdentityService(
      entityService,
      logger,
      defaultIdentity,
    );
    return IdentityService.instance;
  }

  /**
   * Reset the singleton instance (for testing)
   */
  public static resetInstance(): void {
    IdentityService.instance = null;
  }

  /**
   * Create a fresh instance without affecting singleton
   */
  public static createFresh(
    entityService: IEntityService,
    logger: Logger,
    defaultIdentity?: IdentityBody,
  ): IdentityService {
    return new IdentityService(entityService, logger, defaultIdentity);
  }

  /**
   * Private constructor to enforce factory methods
   */
  private constructor(
    entityService: IEntityService,
    logger: Logger,
    defaultIdentity?: IdentityBody,
  ) {
    this.entityService = entityService;
    this.logger = logger.child("IdentityService");
    this.adapter = new IdentityAdapter();
    this.defaultIdentity =
      defaultIdentity ?? IdentityService.getDefaultIdentity();
  }

  /**
   * Initialize the service and load identity into cache
   * Creates a default identity if none exists
   */
  public async initialize(): Promise<void> {
    await this.loadIdentity();

    // If no identity exists, create one with default values
    if (!this.cache) {
      this.logger.info("No identity found, creating default identity");
      try {
        const content = this.adapter.createIdentityContent(
          this.defaultIdentity,
        );

        await this.entityService.createEntity({
          id: "identity",
          entityType: "identity",
          content,
        });

        // Reload the cache with the newly created entity
        await this.loadIdentity();
        this.logger.info("Default identity created successfully");
      } catch (error) {
        this.logger.error("Failed to create default identity", { error });
      }
    }
  }

  /**
   * Get the identity data (from cache or default)
   */
  public getIdentity(): IdentityBody {
    if (this.cache) {
      return this.adapter.parseIdentityBody(this.cache.content);
    }
    return this.defaultIdentity;
  }

  /**
   * Refresh the identity cache from database
   */
  public async refreshCache(): Promise<void> {
    await this.loadIdentity();
  }

  /**
   * Load identity from database into cache
   */
  private async loadIdentity(): Promise<void> {
    try {
      const identity = (await this.entityService.getEntity(
        "identity",
        "identity",
      )) as IdentityEntity | null;

      this.cache = identity;

      if (identity) {
        const identityData = this.adapter.parseIdentityBody(identity.content);
        this.logger.debug("Identity loaded", {
          role: identityData.role,
          values: identityData.values,
        });
      } else {
        this.logger.debug("No identity found in database");
      }
    } catch (error) {
      this.logger.warn("Failed to load identity", { error });
      this.cache = null;
    }
  }
}
