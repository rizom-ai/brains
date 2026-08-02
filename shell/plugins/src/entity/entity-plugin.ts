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
import type { EntityActionPolicyConfig, Template } from "@brains/templates";
import type { JobHandler } from "@brains/job-queue";
import { z } from "@brains/utils/zod";
import type { PluginConfigSchema } from "../config";
import type { EntityPluginContext } from "./context";
import { createEntityPluginContext } from "./context";
import type { ProjectionDeclaration } from "./projection-registry";
import type { ProjectionRule } from "./projection-rule";
import {
  getProjectionDeclaration,
  registerDerivedEntityProjection,
  type DerivedEntityProjection,
  type DerivedEntityProjectionController,
} from "./derived-entity-projection";

export const emptyEntityPluginConfigSchema: z.ZodObject<Record<string, never>> =
  z.object({});

/**
 * Base class for entity plugins — plugins that define an entity type
 * with adapter, optional generation handler, templates, and datasources.
 *
 * EntityPlugins don't expose tools — all entity CRUD goes through system_create/update/delete.
 */
export abstract class EntityPlugin<
  TEntity extends BaseEntity,
  TConfig,
  TConfigInput,
> extends BasePlugin<TConfig, TConfigInput, EntityPluginContext> {
  public readonly type = "entity" as const;

  /** The entity type name (e.g. "post", "deck", "note") */
  abstract readonly entityType: string;

  /** Optional default action policy owned by this entity plugin. */
  public readonly entityActionPolicy?: EntityActionPolicyConfig;

  private readonly derivedEntityProjectionControllers = new Map<
    string,
    DerivedEntityProjectionController
  >();

  constructor(
    id: string,
    packageJson: { name: string; version: string; description?: string },
    config: TConfigInput,
    configSchema: PluginConfigSchema<TConfig>,
    entityActionPolicy?: EntityActionPolicyConfig,
  ) {
    super(id, packageJson, config, configSchema);
    if (entityActionPolicy !== undefined) {
      this.entityActionPolicy = entityActionPolicy;
    }
  }

  /** Schema for validating entities of this type */
  abstract readonly schema: EntityAdapter<TEntity>["schema"];

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

    // Resolve projections before entity registration so projection outputs fail
    // closed as source material unless their plugin explicitly opts them in.
    const projections = this.getDerivedEntityProjections(context);
    const projectionRules = this.getProjectionRules(context);
    const projectionDeclarations = [
      ...projections.map(getProjectionDeclaration),
      ...this.getProjectionDeclarations(context),
    ];
    const entityTypeConfig = this.getEntityTypeConfig();
    const producesOwnEntityType =
      projectionDeclarations.some(
        (projection) => projection.targetType === this.entityType,
      ) || projectionRules.some((rule) => rule.targetType === this.entityType);
    const hasExplicitProjectionSourceOptIn =
      entityTypeConfig?.projectionSource !== false &&
      entityTypeConfig?.projectionSourceRole !== "excluded" &&
      (entityTypeConfig?.projectionSource === true ||
        entityTypeConfig?.projectionSourceRole !== undefined);
    const effectiveEntityTypeConfig =
      producesOwnEntityType && !hasExplicitProjectionSourceOptIn
        ? {
            ...entityTypeConfig,
            projectionSource: false,
            projectionSourceRole: "excluded" as const,
          }
        : entityTypeConfig;

    // Auto-register entity type
    context.entities.register(
      this.entityType,
      this.schema,
      this.adapter,
      effectiveEntityTypeConfig,
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

    // Auto-register executable derived entity projections.
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
      ...(projectionDeclarations.length > 0 && {
        projections: projectionDeclarations,
      }),
      ...(projectionRules.length > 0 && { projectionRules }),
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

  /** Scheduler-owned executable projection rules. */
  protected getProjectionRules(
    _context: EntityPluginContext,
  ): ProjectionRule[] {
    return [];
  }

  /**
   * Override for static declarations backed by custom event-owned execution.
   * Prefer getDerivedEntityProjections when the standard event runner fits.
   */
  protected getProjectionDeclarations(
    _context: EntityPluginContext,
  ): ProjectionDeclaration[] {
    return [];
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
