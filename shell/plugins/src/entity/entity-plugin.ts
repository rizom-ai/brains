import { BasePlugin } from "../base-plugin";
import type {
  PluginCapabilities,
  IShell,
  PluginRegistrationContext,
} from "../interfaces";
import type {
  CreateExecutionContext,
  CreateInput,
  CreateInterceptionResult,
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
import {
  registerDerivedEntityProjection,
  type DerivedEntityProjection,
  type DerivedEntityProjectionController,
} from "./derived-entity-projection";

const emptyConfigSchema = z.object({});

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

  private readonly derivedEntityProjectionControllers = new Map<
    string,
    DerivedEntityProjectionController
  >();

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
  override async register(
    shell: IShell,
    registrationContext?: PluginRegistrationContext,
  ): Promise<PluginCapabilities> {
    const context = createEntityPluginContext(
      shell,
      this.id,
      registrationContext,
    );
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

    if (this.interceptCreate !== EntityPlugin.prototype.interceptCreate) {
      context.entities.registerCreateInterceptor(
        this.entityType,
        (input, executionContext) =>
          this.interceptCreate(input, executionContext, context),
      );
    }

    // Auto-register generation handler if provided
    const handler = this.createGenerationHandler(context);
    if (handler) {
      context.jobs.registerHandler(`${this.entityType}:generation`, handler);
    }

    // Auto-register templates if provided
    const templates = this.getTemplates();
    if (templates && Object.keys(templates).length > 0) {
      shell.registerTemplates(templates, this.id);
    }

    // Auto-register datasources if provided
    const dataSources = this.getDataSources();
    for (const ds of dataSources) {
      context.entities.registerDataSource(ds);
    }

    // Auto-register derived entity projections if provided
    const projections = this.getDerivedEntityProjections(context);
    for (const projection of projections) {
      const controller = registerDerivedEntityProjection(
        context,
        this.logger,
        projection,
      );
      this.derivedEntityProjectionControllers.set(projection.id, controller);
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
   * Override to intercept system_create for this entity type.
   * Subclasses can fully handle creation or continue with a rewritten input.
   */
  protected async interceptCreate(
    input: CreateInput,
    _executionContext: CreateExecutionContext,
    _context: EntityPluginContext,
  ): Promise<CreateInterceptionResult> {
    return { kind: "continue", input };
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
   * Override to declare derived entity projections owned by this plugin.
   */
  protected getDerivedEntityProjections(
    _context: EntityPluginContext,
  ): DerivedEntityProjection[] {
    return [];
  }

  protected getDerivedEntityProjectionController(
    projectionId: string,
  ): DerivedEntityProjectionController | undefined {
    return this.derivedEntityProjectionControllers.get(projectionId);
  }
}
