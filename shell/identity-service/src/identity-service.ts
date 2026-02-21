import type { IEntityService } from "@brains/entity-service";
import { SingletonEntityService } from "@brains/entity-service";
import type { Logger } from "@brains/utils";
import type { IdentityBody } from "./schema";
import { IdentityAdapter } from "./adapter";

/**
 * Identity Service
 * Caches and provides the brain's identity (role, purpose, values)
 */
export class IdentityService extends SingletonEntityService<IdentityBody> {
  private static instance: IdentityService | null = null;
  private adapter = new IdentityAdapter();

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
    super(
      entityService,
      logger,
      "identity",
      defaultIdentity ?? IdentityService.getDefaultIdentity(),
    );
  }

  protected parseBody(content: string): IdentityBody {
    return this.adapter.parseIdentityBody(content);
  }

  protected createContent(body: IdentityBody): string {
    return this.adapter.createIdentityContent(body);
  }

  /**
   * Get the identity data (from cache or default)
   */
  public getIdentity(): IdentityBody {
    return this.get();
  }

  /**
   * Get the raw identity content (markdown)
   */
  public getIdentityContent(): string {
    return this.getContent();
  }
}
