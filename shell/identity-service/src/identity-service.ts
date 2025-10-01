import type { IEntityService } from "@brains/entity-service";
import type { Logger } from "@brains/utils";
import type { IdentityEntity } from "./schema";
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

  /**
   * Get the singleton instance
   */
  public static getInstance(
    entityService: IEntityService,
    logger: Logger,
  ): IdentityService {
    IdentityService.instance ??= new IdentityService(entityService, logger);
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
  ): IdentityService {
    return new IdentityService(entityService, logger);
  }

  /**
   * Private constructor to enforce factory methods
   */
  private constructor(entityService: IEntityService, logger: Logger) {
    this.entityService = entityService;
    this.logger = logger.child("IdentityService");
    this.adapter = new IdentityAdapter();
  }

  /**
   * Initialize the service and load identity into cache
   */
  public async initialize(): Promise<void> {
    await this.loadIdentity();
  }

  /**
   * Get the cached identity
   */
  public async getIdentity(): Promise<IdentityEntity | null> {
    return this.cache;
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
        "system:identity",
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
