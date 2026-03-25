import { BasePlugin } from "../base-plugin";
import type { PluginCapabilities, IShell } from "../interfaces";
import type {
  EntityAdapter,
  BaseEntity,
  DataSource,
  EntityTypeConfig,
} from "@brains/entity-service";
import type { Template } from "@brains/templates";
import type { JobHandler } from "@brains/job-queue";
import { z } from "@brains/utils";
import type { EntityPluginContext } from "./context";
import { createEntityPluginContext } from "./context";

const emptyConfigSchema = z.object({});

export type DeriveEvent = "created" | "updated" | "deleted" | "extract";

/**
 * Base class for entity plugins — plugins that define an entity type
 * with adapter, optional generation handler, templates, and datasources.
 *
 * EntityPlugins don't expose tools — all entity CRUD goes through system_create/update/delete.
 */
export abstract class EntityPlugin<
  TEntity extends BaseEntity = BaseEntity,
  TConfig = Record<string, never>,
> extends BasePlugin<TConfig, EntityPluginContext> {
  public readonly type = "entity" as const;

  /** The entity type name (e.g. "post", "deck", "note") */
  abstract readonly entityType: string;

  constructor(
    id: string,
    packageJson: { name: string; version: string; description?: string },
    config: Partial<TConfig> = {} as Partial<TConfig>,
    configSchema: z.ZodTypeAny = emptyConfigSchema,
  ) {
    super(id, packageJson, config, configSchema);
  }

  /** Zod schema for validating entities of this type */
  abstract readonly schema: z.ZodSchema<TEntity>;

  /** Entity adapter for serialization/deserialization */
  abstract readonly adapter: EntityAdapter<TEntity>;

  /**
   * Register the plugin with shell — creates context and auto-registers
   * entity type, handlers, templates, and datasources.
   */
  override async register(shell: IShell): Promise<PluginCapabilities> {
    const context = createEntityPluginContext(shell, this.id);
    this.context = context;

    // Set up message handlers (tool/resource execution via message bus)
    this.setupMessageHandlers(context);

    // Auto-register entity type
    context.entities.register(
      this.entityType,
      this.schema,
      this.adapter,
      this.getEntityTypeConfig(),
    );

    // Auto-register generation handler if provided
    const handler = this.createGenerationHandler(context);
    if (handler) {
      context.jobs.registerHandler(`${this.entityType}:generation`, handler);
    }

    // Auto-register extract handler if derive() is overridden
    if (this.hasDeriveHandler()) {
      const extractHandler = this.createExtractHandler(context);
      context.jobs.registerHandler(
        `${this.entityType}:extract`,
        extractHandler,
      );
    }

    // Auto-register templates if provided
    const templates = this.getTemplates();
    if (templates && Object.keys(templates).length > 0) {
      context.templates.register(templates);
    }

    // Auto-register datasources if provided
    const dataSources = this.getDataSources();
    for (const ds of dataSources) {
      context.entities.registerDataSource(ds);
    }

    // Call subclass hook for additional registration
    await this.onRegister(this.context);

    const instructions = await this.getInstructions();
    return {
      tools: [],
      resources: [],
      ...(instructions && { instructions }),
    };
  }

  /**
   * Override to provide a generation handler for this entity type.
   * Registered as `{entityType}:generation` automatically.
   */
  protected createGenerationHandler(
    _context: EntityPluginContext,
  ): JobHandler | null {
    return null;
  }

  /**
   * Override to provide AI templates for this entity type.
   */
  protected getTemplates(): Record<string, Template> | null {
    return null;
  }

  /**
   * Override to provide datasources for site building.
   */
  protected getDataSources(): DataSource[] {
    return [];
  }

  /**
   * Override to provide entity type config (e.g. search weight).
   */
  protected getEntityTypeConfig(): EntityTypeConfig | undefined {
    return undefined;
  }

  /**
   * Create the extract handler that wraps derive() for job queue routing.
   * Called automatically during registration when hasDeriveHandler() is true.
   */
  private createExtractHandler(context: EntityPluginContext): JobHandler {
    const extractDataSchema = z.object({
      sourceId: z.string().optional(),
      sourceType: z.string().optional(),
    });

    return {
      process: async (
        data: z.infer<typeof extractDataSchema>,
      ): Promise<{ extracted: number }> => {
        if (data.sourceId && data.sourceType) {
          const source = await context.entityService.getEntity(
            data.sourceType,
            data.sourceId,
          );
          if (source) {
            await this.derive(source, "extract", context);
            return { extracted: 1 };
          }
          return { extracted: 0 };
        }
        // Batch mode — no source specified, call deriveAll()
        await this.deriveAll(context);
        return { extracted: 0 };
      },
      validateAndParse(
        data: unknown,
      ): z.infer<typeof extractDataSchema> | null {
        const result = extractDataSchema.safeParse(data ?? {});
        return result.success ? result.data : null;
      },
    };
  }

  /**
   * Override to derive entities from a source entity in response to events.
   *
   * Used for entity types that are automatically maintained (e.g. topics
   * extracted from posts, series grouped from posts/decks). The plugin
   * subscribes to events in onRegister() and calls derive() itself.
   *
   * Also callable via `system_extract` for batch reprocessing.
   */
  public async derive(
    _source: BaseEntity,
    _event: string,
    _context: EntityPluginContext,
  ): Promise<void> {
    // No-op by default — subclasses override to implement derivation logic
  }

  /**
   * Override to batch-derive all entities of this type.
   * Called by `system_extract` when no source is specified.
   *
   * Subclasses implement full resync logic here (e.g. series syncs
   * from all entities with seriesName, topics re-extracts from all posts).
   */
  public async deriveAll(_context: EntityPluginContext): Promise<void> {
    // No-op by default — subclasses override for batch derivation
  }

  /**
   * Check whether this plugin has a derive() implementation.
   * Used by system_extract to determine if extraction is supported.
   */
  public hasDeriveHandler(): boolean {
    return this.derive !== EntityPlugin.prototype.derive;
  }
}
