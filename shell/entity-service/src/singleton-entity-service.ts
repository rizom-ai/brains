import type { EntityService } from "./types";
import type { Logger } from "@brains/utils";
import type { BaseEntity } from "./types";

/**
 * Base class for singleton entity services (identity, profile, etc.)
 *
 * Provides shared lifecycle: initialize, get, getContent, refreshCache.
 * Subclasses implement parseBody and createContent for their specific entity type.
 */
export abstract class SingletonEntityService<TBody> {
  private cache: BaseEntity | null = null;
  private logger: Logger;
  private entityService: EntityService;
  private entityType: string;
  private defaultBody: TBody;

  constructor(
    entityService: EntityService,
    logger: Logger,
    entityType: string,
    defaultBody: TBody,
  ) {
    this.entityService = entityService;
    this.logger = logger.child(this.constructor.name);
    this.entityType = entityType;
    this.defaultBody = defaultBody;
  }

  /**
   * Parse the entity body from raw content string
   */
  protected abstract parseBody(content: string): TBody;

  /**
   * Create raw content string from the body
   */
  protected abstract createContent(body: TBody): string;

  /**
   * Initialize the service and load entity into cache.
   * Creates a default entity if none exists.
   */
  public async initialize(): Promise<void> {
    await this.load();

    if (!this.cache) {
      this.logger.info(
        `No ${this.entityType} found, creating default ${this.entityType}`,
      );
      try {
        const content = this.createContent(this.defaultBody);

        await this.entityService.createEntity({
          id: this.entityType,
          entityType: this.entityType,
          content,
          metadata: {},
        });

        await this.load();
        this.logger.info(`Default ${this.entityType} created successfully`);
      } catch (error) {
        this.logger.error(`Failed to create default ${this.entityType}`, {
          error,
        });
      }
    }
  }

  /**
   * Get the parsed body data (from cache or default)
   */
  public get(): TBody {
    if (this.cache) {
      return this.parseBody(this.cache.content);
    }
    return this.defaultBody;
  }

  /**
   * Get the raw content string (from cache or created from default)
   */
  public getContent(): string {
    if (this.cache) {
      return this.cache.content;
    }
    return this.createContent(this.defaultBody);
  }

  /**
   * Refresh the cache from database
   */
  public async refreshCache(): Promise<void> {
    await this.load();
  }

  /**
   * Load entity from database into cache
   */
  private async load(): Promise<void> {
    try {
      const entity = await this.entityService.getEntity<BaseEntity>(
        this.entityType,
        this.entityType,
      );

      this.cache = entity;

      if (entity) {
        this.logger.debug(`${this.entityType} loaded`);
      } else {
        this.logger.debug(`No ${this.entityType} found in database`);
      }
    } catch (error) {
      this.logger.warn(`Failed to load ${this.entityType}`, { error });
      this.cache = null;
    }
  }
}
