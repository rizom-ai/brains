import type { EntityService, BaseEntity } from "./types";
import type { Logger } from "@brains/utils";

/**
 * Base class for singleton entity services (identity, profile, etc.)
 *
 * Provides shared lifecycle: initialize, get, getContent, refreshCache.
 * Subclasses implement parseBody and createContent for their specific entity type.
 */
export abstract class SingletonEntityService<TBody> {
  private cache: BaseEntity | null = null;
  /**
   * Tracks whether the cached entity's content failed to parse. When true,
   * `get()` returns `defaultBody` instead of attempting to re-parse on every
   * call. Reset on successful (re)load.
   */
  private cacheParseError: Error | null = null;
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
      // Initial sync/import may populate singleton markdown after the first
      // cache miss. Re-check immediately before creating defaults so cold
      // starts with existing brain-data do not overwrite real identity files.
      await this.load();
      if (this.cache) return;

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
   * Get the parsed body data (from cache or default).
   *
   * Never throws — if the cached entity content fails schema validation, the
   * default body is returned and the parse error was already logged once at
   * load time. This keeps the rendering pipeline alive when user data is
   * malformed instead of crashing every render with a stack trace.
   */
  public get(): TBody {
    if (this.cache && !this.cacheParseError) {
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
   * Load entity from database into cache.
   *
   * Validates the entity content by attempting a parse. If parsing fails,
   * the cache is kept (so `getContent()` can still return the raw content),
   * but `cacheParseError` is set so `get()` returns the default body instead
   * of re-throwing on every call. The parse error is logged once with the
   * full validation message so users can fix their data.
   */
  private async load(): Promise<void> {
    try {
      const entity = await this.entityService.getEntity<BaseEntity>(
        this.entityType,
        this.entityType,
      );

      this.cache = entity;
      this.cacheParseError = null;

      if (entity) {
        try {
          this.parseBody(entity.content);
          this.logger.debug(`${this.entityType} loaded`);
        } catch (parseError) {
          this.cacheParseError =
            parseError instanceof Error
              ? parseError
              : new Error(String(parseError));
          this.logger.error(
            `Failed to parse ${this.entityType} — using default. Fix the entity content to clear this error.`,
            { error: this.cacheParseError.message },
          );
        }
      } else {
        this.logger.debug(`No ${this.entityType} found in database`);
      }
    } catch (error) {
      this.logger.warn(`Failed to load ${this.entityType}`, { error });
      this.cache = null;
      this.cacheParseError = null;
    }
  }
}
