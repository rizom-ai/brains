import { EntityPlugin as RuntimeEntityPlugin } from "../entity/entity-plugin";
import type { EntityPluginContext as RuntimeEntityPluginContext } from "../entity/context";
import type { PluginConfigSchema } from "../config";
import type {
  BaseEntity,
  CreateExecutionContext,
  CreateInput,
  CreateInterceptionResult,
  DataSource,
  EntityAdapter,
  EntityTypeConfig,
} from "@brains/entity-service";
import type {
  EntityPluginContext,
  ProjectionDeclaration,
  ProjectionRule,
} from "./types";
import {
  PublicPlugin,
  type PluginPackageJson,
  type RuntimePluginDelegate,
} from "./public-plugin";

type EntitySchema<TEntity extends BaseEntity> =
  EntityAdapter<TEntity>["schema"];

interface EntityPluginHooks<TEntity extends BaseEntity> {
  getEntityType(): string;
  getSchema(): EntitySchema<TEntity>;
  getAdapter(): EntityAdapter<TEntity>;
  onRegister(context: EntityPluginContext): Promise<void>;
  onReady(context: EntityPluginContext): Promise<void>;
  onShutdown(): Promise<void>;
  getEntityTypeConfig(): EntityTypeConfig | undefined;
  getDataSources(): DataSource[];
  getProjectionRules(context: EntityPluginContext): ProjectionRule[];
  getProjectionDeclarations(
    context: EntityPluginContext,
  ): ProjectionDeclaration[];
  getInstructions(): Promise<string | undefined>;
  interceptCreate(
    input: CreateInput,
    executionContext: CreateExecutionContext,
    context: EntityPluginContext,
  ): Promise<CreateInterceptionResult>;
}

class EntityPluginDelegate<
  TEntity extends BaseEntity,
  TConfig,
  TConfigInput,
> extends RuntimeEntityPlugin<TEntity, TConfig, TConfigInput> {
  private readonly hooks: EntityPluginHooks<TEntity>;

  constructor(
    id: string,
    packageJson: PluginPackageJson,
    config: TConfigInput,
    configSchema: PluginConfigSchema<TConfig>,
    hooks: EntityPluginHooks<TEntity>,
  ) {
    super(id, packageJson, config, configSchema);
    this.hooks = hooks;
  }

  override get entityType(): string {
    return this.hooks.getEntityType();
  }

  override get schema(): EntitySchema<TEntity> {
    return this.hooks.getSchema();
  }

  override get adapter(): EntityAdapter<TEntity> {
    return this.hooks.getAdapter();
  }

  protected override onRegister(
    context: RuntimeEntityPluginContext,
  ): Promise<void> {
    return this.hooks.onRegister(context);
  }

  protected override onReady(
    context: RuntimeEntityPluginContext,
  ): Promise<void> {
    return this.hooks.onReady(context);
  }

  protected override onShutdown(): Promise<void> {
    return this.hooks.onShutdown();
  }

  protected override getEntityTypeConfig(): EntityTypeConfig | undefined {
    return this.hooks.getEntityTypeConfig();
  }

  protected override getDataSources(): DataSource[] {
    return this.hooks.getDataSources();
  }

  protected override getProjectionRules(
    context: RuntimeEntityPluginContext,
  ): ProjectionRule[] {
    return this.hooks.getProjectionRules(context);
  }

  protected override getProjectionDeclarations(
    context: RuntimeEntityPluginContext,
  ): ProjectionDeclaration[] {
    return this.hooks.getProjectionDeclarations(context);
  }

  protected override getInstructions(): Promise<string | undefined> {
    return this.hooks.getInstructions();
  }

  protected override interceptCreate(
    input: CreateInput,
    executionContext: CreateExecutionContext,
    context: RuntimeEntityPluginContext,
  ): Promise<CreateInterceptionResult> {
    return this.hooks.interceptCreate(input, executionContext, context);
  }
}

export abstract class EntityPlugin<
  TEntity extends BaseEntity,
  TConfig,
  TConfigInput,
> extends PublicPlugin<TConfig, TConfigInput> {
  public readonly type = "entity" as const;
  public abstract readonly entityType: string;
  public abstract readonly schema: EntitySchema<TEntity>;
  public abstract readonly adapter: EntityAdapter<TEntity>;

  /** @internal */
  protected override createDelegate(): RuntimePluginDelegate {
    return new EntityPluginDelegate<TEntity, TConfig, TConfigInput>(
      this.id,
      this.packageJson,
      this.pluginConfig,
      this.configSchema,
      {
        getEntityType: (): string => this.entityType,
        getSchema: (): EntitySchema<TEntity> => this.schema,
        getAdapter: (): EntityAdapter<TEntity> => this.adapter,
        onRegister: (context): Promise<void> => this.onRegister(context),
        onReady: (context): Promise<void> => this.onReady(context),
        onShutdown: (): Promise<void> => this.onShutdown(),
        getEntityTypeConfig: (): EntityTypeConfig | undefined =>
          this.getEntityTypeConfig(),
        getDataSources: (): DataSource[] => this.getDataSources(),
        getProjectionRules: (context): ProjectionRule[] =>
          this.getProjectionRules(context),
        getProjectionDeclarations: (context): ProjectionDeclaration[] =>
          this.getProjectionDeclarations(context),
        getInstructions: (): Promise<string | undefined> =>
          this.getInstructions(),
        interceptCreate: (
          input,
          executionContext,
          context,
        ): Promise<CreateInterceptionResult> =>
          this.interceptCreate(input, executionContext, context),
      },
    );
  }

  protected async onRegister(_context: EntityPluginContext): Promise<void> {}
  protected async onReady(_context: EntityPluginContext): Promise<void> {}
  protected async onShutdown(): Promise<void> {}
  protected async getInstructions(): Promise<string | undefined> {
    return undefined;
  }
  protected getEntityTypeConfig(): EntityTypeConfig | undefined {
    return undefined;
  }
  protected getDataSources(): DataSource[] {
    return [];
  }
  protected getProjectionRules(
    _context: EntityPluginContext,
  ): ProjectionRule[] {
    return [];
  }
  protected getProjectionDeclarations(
    _context: EntityPluginContext,
  ): ProjectionDeclaration[] {
    return [];
  }
  protected async interceptCreate(
    input: CreateInput,
    _executionContext: CreateExecutionContext,
    _context: EntityPluginContext,
  ): Promise<CreateInterceptionResult> {
    return { kind: "continue", input };
  }
}
